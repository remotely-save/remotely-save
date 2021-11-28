import {
  App,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  request,
  Platform,
  TFile,
  TFolder,
} from "obsidian";
import * as CodeMirror from "codemirror";
import {
  prepareDBs,
  destroyDBs,
  loadDeleteRenameHistoryTable,
  clearAllSyncPlanRecords,
  clearAllSyncMetaMapping,
  insertDeleteRecord,
  insertRenameRecord,
  insertSyncPlanRecord,
} from "./localdb";
import type { InternalDBs } from "./localdb";

import type { SyncStatusType, PasswordCheckType } from "./sync";
import { isPasswordOk, getSyncPlan, doActualSync } from "./sync";

import { S3Config, DEFAULT_S3_CONFIG } from "./s3";
import { WebdavConfig, DEFAULT_WEBDAV_CONFIG, WebdavAuthType } from "./webdav";
import {
  DropboxConfig,
  DEFAULT_DROPBOX_CONFIG,
  getCodeVerifierAndChallenge,
  getAuthUrl,
  sendAuthReq,
  setConfigBySuccessfullAuthInplace,
} from "./remoteForDropbox";

import { RemoteClient } from "./remote";
import { exportSyncPlansToFiles } from "./debugMode";
import { SUPPORTED_SERVICES_TYPE } from "./baseTypes";

interface RemotelySavePluginSettings {
  s3: S3Config;
  webdav: WebdavConfig;
  dropbox: DropboxConfig;
  password: string;
  serviceType: SUPPORTED_SERVICES_TYPE;
  enableExperimentService: boolean;
}

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  webdav: DEFAULT_WEBDAV_CONFIG,
  dropbox: DEFAULT_DROPBOX_CONFIG,
  password: "",
  serviceType: "s3",
  enableExperimentService: false,
};

export default class RemotelySavePlugin extends Plugin {
  settings: RemotelySavePluginSettings;
  cm: CodeMirror.Editor;
  db: InternalDBs;
  syncStatus: SyncStatusType;

  async onload() {
    console.log("loading plugin obsidian-remotely-save");

    await this.loadSettings();

    await this.prepareDB();

    this.syncStatus = "idle";

    this.registerEvent(
      this.app.vault.on("delete", async (fileOrFolder) => {
        await insertDeleteRecord(this.db, fileOrFolder);
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (fileOrFolder, oldPath) => {
        await insertRenameRecord(this.db, fileOrFolder, oldPath);
      })
    );

    this.addRibbonIcon("switch", "Remotely Save", async () => {
      if (this.syncStatus !== "idle") {
        new Notice(
          `Remotely Save already running in stage ${this.syncStatus}!`
        );
        return;
      }

      try {
        //console.log(`huh ${this.settings.password}`)
        new Notice(
          `1/6 Remotely Save Sync Preparing (${this.settings.serviceType})`
        );
        this.syncStatus = "preparing";

        new Notice("2/6 Starting to fetch remote meta data.");
        this.syncStatus = "getting_remote_meta";
        const self = this;
        const client = new RemoteClient(
          this.settings.serviceType,
          this.settings.s3,
          this.settings.webdav,
          this.settings.dropbox,
          () => self.saveSettings()
        );
        const remoteRsp = await client.listFromRemote();
        // console.log(remoteRsp);

        new Notice("3/6 Starting to fetch local meta data.");
        this.syncStatus = "getting_local_meta";
        const local = this.app.vault.getAllLoadedFiles();
        const localHistory = await loadDeleteRenameHistoryTable(this.db);
        // console.log(local);
        // console.log(localHistory);

        new Notice("4/7 Checking password correct or not.");
        this.syncStatus = "checking_password";
        const passwordCheckResult = await isPasswordOk(
          remoteRsp.Contents,
          this.settings.password
        );
        if (!passwordCheckResult.ok) {
          new Notice("something goes wrong while checking password");
          throw Error(passwordCheckResult.reason);
        }

        new Notice("5/7 Starting to generate sync plan.");
        this.syncStatus = "generating_plan";
        const syncPlan = await getSyncPlan(
          remoteRsp.Contents,
          local,
          localHistory,
          this.db,
          client.serviceType,
          this.settings.password
        );
        console.log(syncPlan.mixedStates); // for debugging
        await insertSyncPlanRecord(this.db, syncPlan);

        // The operations above are read only and kind of safe.
        // The operations below begins to write or delete (!!!) something.

        new Notice("6/7 Remotely Save Sync data exchanging!");

        this.syncStatus = "syncing";
        await doActualSync(
          client,
          this.db,
          this.app.vault,
          syncPlan,
          this.settings.password
        );

        new Notice("7/7 Remotely Save finish!");
        this.syncStatus = "finish";
        this.syncStatus = "idle";
      } catch (error) {
        const msg = `Remotely Save error while ${this.syncStatus}`;
        console.log(msg);
        console.log(error);
        new Notice(msg);
        new Notice(error.message);
        this.syncStatus = "idle";
      }
    });

    this.addSettingTab(new RemotelySaveSettingTab(this.app, this));

    // this.registerCodeMirror((cm: CodeMirror.Editor) => {
    //   this.cm = cm;
    //   console.log("codemirror registered.");
    // });

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   console.log("click", evt);
    // });

    // this.registerInterval(
    //   window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
    // );
  }

  onunload() {
    console.log("unloading plugin obsidian-remotely-save");
    this.destroyDBs();
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) /* copy an object */,
      await this.loadData()
    );
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async prepareDB() {
    this.db = await prepareDBs();
  }

  destroyDBs() {
    /* destroyDBs(this.db); */
  }
}

export class PasswordModal extends Modal {
  plugin: RemotelySavePlugin;
  newPassword: string;
  constructor(app: App, plugin: RemotelySavePlugin, newPassword: string) {
    super(app);
    this.plugin = plugin;
    this.newPassword = newPassword;
  }

  onOpen() {
    let { contentEl } = this;
    // contentEl.setText("Add Or change password.");
    contentEl.createEl("h2", { text: "Hold on and PLEASE READ ON..." });
    contentEl.createEl("p", {
      text: "If the field is not empty, files are enctrypted using the password locally before sent to remote.",
    });
    contentEl.createEl("p", {
      text: "If the field is empty, then no password is used, and files would be sent without encryption.",
    });

    contentEl.createEl("p", {
      text: "Attention 1/4: The password itself is stored in PLAIN TEXT LOCALLY and would not be sent to remote by this plugin.",
    });
    contentEl.createEl("p", {
      text: "Attention 2/4: Non-empty file contents are encrypted using openssl format. File/directory path are also encrypted then applied base32. BUT, some metadata such as file sizes and directory structures are not encrypted or can be easily guessed, and directory path are stored as 0-byte-size object remotely.",
    });
    contentEl.createEl("p", {
      text: "Attention 3/4: Before changing password, you should make sure the remote store (s3/webdav/...) IS EMPTY, or REMOTE FILES WERE ENCRYPTED BY THAT NEW PASSWORD. OTHERWISE SOMETHING BAD WOULD HAPPEN!",
    });
    contentEl.createEl("p", {
      text: "Attention 4/4: The longer the password, the better.",
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("The Second Confirm to change password.");
        button.onClick(async () => {
          this.plugin.settings.password = this.newPassword;
          await this.plugin.saveSettings();
          new Notice("New password saved!");
          this.close();
        });
        button.setClass("password_second_confirm");
      })
      .addButton((button) => {
        button.setButtonText("Go Back");
        button.onClick(() => {
          this.close();
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

export class DropboxAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly revokeAuthSetting: Setting;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    revokeAuthSetting: Setting
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.revokeAuthSetting = revokeAuthSetting;
  }

  onOpen() {
    let { contentEl } = this;

    const k = getCodeVerifierAndChallenge();
    const authUrl = getAuthUrl(
      this.plugin.settings.dropbox.clientID,
      k.challenge
    );

    contentEl.createEl("p", {
      text: "Step 1: Visit the following address in a browser, and follow the steps on the web page to authorize.",
    });
    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });

    contentEl.createEl("p", {
      text: 'Step 2: In the end of the web flow, you obtain a long code. Paste it here then click "Submit".',
    });

    let authCode = "";
    new Setting(contentEl)
      .setName("Auth Code from web page")
      .setDesc('You need to click "Confirm".')
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue("")
          .onChange((val) => {
            authCode = val.trim();
          })
      )
      .addButton(async (button) => {
        button.setButtonText("Confirm");
        button.onClick(async () => {
          new Notice("Trying to connect to Dropbox");
          try {
            const authRes = await sendAuthReq(
              this.plugin.settings.dropbox.clientID,
              k.verifier,
              authCode
            );
            setConfigBySuccessfullAuthInplace(
              this.plugin.settings.dropbox,
              authRes
            );
            const self = this;
            const client = new RemoteClient(
              "dropbox",
              undefined,
              undefined,
              this.plugin.settings.dropbox,
              () => self.plugin.saveSettings()
            );
            const username = await client.getUser();
            this.plugin.settings.dropbox.username = username;
            await this.plugin.saveSettings();
            new Notice(`Good! We've connected to Dropbox as user ${username}!`);
            this.authDiv.toggleClass(
              "dropbox-auth-button-hide",
              this.plugin.settings.dropbox.username !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "dropbox-revoke-auth-button-hide",
              this.plugin.settings.dropbox.username === ""
            );
            this.revokeAuthSetting.setDesc(
              `You've connected as user ${this.plugin.settings.dropbox.username}. If you want to disconnect, click this button`
            );
            this.close();
          } catch (err) {
            console.error(err);
            new Notice("Something goes wrong while connecting to Dropbox.");
          }
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class RemotelySaveSettingTab extends PluginSettingTab {
  plugin: RemotelySavePlugin;

  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h1", { text: "Remotely Save" });

    const generalDiv = containerEl.createEl("div");
    generalDiv.createEl("h2", { text: "General" });

    const passwordDiv = generalDiv.createEl("div");
    let newPassword = `${this.plugin.settings.password}`;
    new Setting(passwordDiv)
      .setName("encryption password")
      .setDesc(
        'Password for E2E encryption. Empty for no password. You need to click "Confirm".'
      )
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.password}`)
          .onChange(async (value) => {
            newPassword = value.trim();
          })
      )
      .addButton(async (button) => {
        button.setButtonText("Confirm");
        button.onClick(async () => {
          new PasswordModal(this.app, this.plugin, newPassword).open();
        });
      });

    // we need to create the div in advance of any other service divs
    const serviceChooserDiv = generalDiv.createEl("div");

    let clickChooserTimes = 0;
    serviceChooserDiv.onClickEvent(async (x) => {
      if (Platform.isIosApp) {
        // downgrade the experiment
        // because iOS doesn't support x.detail
        clickChooserTimes += 1;
        setTimeout(function () {
          clickChooserTimes = 0;
        }, 2000);
      }

      if ((Platform.isIosApp && clickChooserTimes === 5) || x.detail === 5) {
        if (this.plugin.settings.serviceType === "webdav") {
          new Notice(
            "You've enabled hidden unstable experimental webdav support before. Nothing changes."
          );
        } else if (!this.plugin.settings.enableExperimentService) {
          this.plugin.settings.enableExperimentService = true;
          await this.plugin.saveSettings();
          new Notice(
            "You've enabled hidden unstable experimental webdav support. Reopen settings again and try webdav with caution."
          );
        } else if (this.plugin.settings.enableExperimentService) {
          this.plugin.settings.enableExperimentService = false;
          await this.plugin.saveSettings();
          new Notice(
            "You've disabled hidden unstable experimental webdav support. Reopen settings again."
          );
        }
      }
      x.preventDefault();
    });

    const s3Div = containerEl.createEl("div", { cls: "s3-hide" });
    s3Div.toggleClass("s3-hide", this.plugin.settings.serviceType !== "s3");
    s3Div.createEl("h2", { text: "S3 (-compatible) Service" });

    s3Div.createEl("p", {
      text: "You can use Amazon S3 or another S3-compatible service to sync your vault. Enter your bucket information below.",
    });

    s3Div.createEl("p", {
      text: "Disclaimer: The infomation is stored in PLAIN TEXT locally. Other malicious/harmful/faulty plugins may or may not be able to read the info. If you see any unintentional access to your S3 bucket, please immediately delete the access key to stop further accessment.",
      cls: "s3-disclaimer",
    });

    s3Div.createEl("p", {
      text: "You need to configure CORS to allow requests from origin app://obsidian.md and capacitor://localhost and http://localhost",
    });

    s3Div.createEl("p", {
      text: "Some Amazon S3 official docs:",
    });

    const s3LinksUl = s3Div.createEl("div").createEl("ul");

    s3LinksUl.createEl("li").createEl("a", {
      href: "https://docs.aws.amazon.com/general/latest/gr/s3.html",
      text: "Endpoint and region info",
    });

    s3LinksUl.createEl("li").createEl("a", {
      href: "https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html",
      text: "Access key ID and Secret access key info",
    });

    s3LinksUl.createEl("li").createEl("a", {
      href: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html",
      text: "Configuring CORS",
    });

    new Setting(s3Div)
      .setName("s3Endpoint")
      .setDesc("s3Endpoint")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.s3.s3Endpoint)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3Endpoint = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName("s3Region")
      .setDesc("s3Region")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3Region}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3Region = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName("s3AccessKeyID")
      .setDesc("s3AccessKeyID")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3AccessKeyID}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3AccessKeyID = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName("s3SecretAccessKey")
      .setDesc("s3SecretAccessKey")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3SecretAccessKey}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3SecretAccessKey = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName("s3BucketName")
      .setDesc("s3BucketName")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3BucketName}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3BucketName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName("check connectivity")
      .setDesc("check connectivity")
      .addButton(async (button) => {
        button.setButtonText("Check");
        button.onClick(async () => {
          new Notice("Checking...");
          const client = new RemoteClient(
            "s3",
            this.plugin.settings.s3,
            undefined
          );
          const res = await client.checkConnectivity();
          if (res) {
            new Notice("Great! The bucket can be accessed.");
          } else {
            new Notice("The S3 bucket cannot be reached.");
          }
        });
      });

    const dropboxDiv = containerEl.createEl("div", { cls: "dropbox-hide" });
    dropboxDiv.toggleClass(
      "dropbox-hide",
      this.plugin.settings.serviceType !== "dropbox"
    );
    dropboxDiv.createEl("h2", { text: "for Dropbox" });
    dropboxDiv.createEl("p", {
      text: "Disclaimer: Sync support for Dropbox are more experimental, and s3 functions are more stable now.",
      cls: "dropbox-disclaimer",
    });
    dropboxDiv.createEl("p", {
      text: "Disclaimer: This app is NOT an official Dropbox product. It just uses Dropbox open api.",
      cls: "dropbox-disclaimer",
    });
    dropboxDiv.createEl("p", {
      text: "We will create a folder App/obsidian-remotely-save on your Dropbox. All files/folders sync would happen inside this folder.",
    });

    const dropboxSelectAuthDiv = dropboxDiv.createDiv();
    const dropboxAuthDiv = dropboxSelectAuthDiv.createDiv({
      cls: "dropbox-auth-button-hide",
    });
    const dropboxRevokeAuthDiv = dropboxSelectAuthDiv.createDiv({
      cls: "dropbox-revoke-auth-button-hide",
    });

    const revokeAuthSetting = new Setting(dropboxRevokeAuthDiv)
      .setName("Revoke Auth")
      .setDesc(
        `You've connected as user ${this.plugin.settings.dropbox.username}. If you want to disconnect, click this button`
      )
      .addButton(async (button) => {
        button.setButtonText("Revoke Auth");
        button.onClick(async () => {
          try {
            const self = this;
            const client = new RemoteClient(
              "dropbox",
              undefined,
              undefined,
              this.plugin.settings.dropbox,
              () => self.plugin.saveSettings()
            );
            await client.revokeAuth();
            this.plugin.settings.dropbox = JSON.parse(
              JSON.stringify(DEFAULT_DROPBOX_CONFIG)
            );
            await this.plugin.saveSettings();
            dropboxAuthDiv.toggleClass(
              "dropbox-auth-button-hide",
              this.plugin.settings.dropbox.username !== ""
            );
            dropboxRevokeAuthDiv.toggleClass(
              "dropbox-revoke-auth-button-hide",
              this.plugin.settings.dropbox.username === ""
            );
            new Notice("Revoked!");
          } catch (err) {
            console.error(err);
            new Notice("Something goes wrong while revoking");
          }
        });
      });

    new Setting(dropboxAuthDiv)
      .setName("Auth")
      .setDesc("Auth")
      .addButton(async (button) => {
        button.setButtonText("Auth");
        button.onClick(async () => {
          new DropboxAuthModal(
            this.app,
            this.plugin,
            dropboxAuthDiv,
            dropboxRevokeAuthDiv,
            revokeAuthSetting
          ).open();
        });
      });

    dropboxAuthDiv.toggleClass(
      "dropbox-auth-button-hide",
      this.plugin.settings.dropbox.username !== ""
    );
    dropboxRevokeAuthDiv.toggleClass(
      "dropbox-revoke-auth-button-hide",
      this.plugin.settings.dropbox.username === ""
    );

    new Setting(dropboxDiv)
      .setName("check connectivity")
      .setDesc("check connectivity")
      .addButton(async (button) => {
        button.setButtonText("Check");
        button.onClick(async () => {
          new Notice("Checking...");
          const self = this;
          const client = new RemoteClient(
            "dropbox",
            undefined,
            undefined,
            this.plugin.settings.dropbox,
            () => self.plugin.saveSettings()
          );

          const res = await client.checkConnectivity();
          if (res) {
            new Notice("Great! We can connect to Dropbox!");
          } else {
            new Notice("We cannot connect to Dropbox.");
          }
        });
      });

    const webdavDiv = containerEl.createEl("div", { cls: "webdav-hide" });
    webdavDiv.toggleClass(
      "webdav-hide",
      this.plugin.settings.serviceType !== "webdav"
    );

    webdavDiv.createEl("h2", { text: "Webdav Service" });

    webdavDiv.createEl("p", {
      text: "Disclaimer: Webdav functions are more experimental, and s3 functions are more stable now.",
      cls: "webdav-disclaimer",
    });

    webdavDiv.createEl("p", {
      text: "Disclaimer: The infomation is stored in PLAIN TEXT locally. Other malicious/harmful/faulty plugins may or may not be able to read the info. If you see any unintentional access to your webdav server, please immediately change the username and/or password to stop further accessment.",
      cls: "webdav-disclaimer",
    });

    webdavDiv.createEl("p", {
      text: "You need to configure CORS to allow requests from origin app://obsidian.md and capacitor://localhost and http://localhost",
    });

    new Setting(webdavDiv)
      .setName("server address")
      .setDesc("server address")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.address)
          .onChange(async (value) => {
            this.plugin.settings.webdav.address = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(webdavDiv)
      .setName("server username")
      .setDesc("server username")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.username)
          .onChange(async (value) => {
            this.plugin.settings.webdav.username = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(webdavDiv)
      .setName("server password")
      .setDesc("server password")
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.password)
          .onChange(async (value) => {
            this.plugin.settings.webdav.password = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(webdavDiv)
      .setName("server auth type")
      .setDesc(
        "Server auth type. If you do not set password, this option would be ignored."
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("basic", "basic");
        dropdown.addOption("digest", "digest");

        dropdown
          .setValue(this.plugin.settings.webdav.authType)
          .onChange(async (val: WebdavAuthType) => {
            this.plugin.settings.webdav.authType = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName("check connectivity")
      .setDesc("check connectivity")
      .addButton(async (button) => {
        button.setButtonText("Check");
        button.onClick(async () => {
          new Notice("Checking...");
          const client = new RemoteClient(
            "webdav",
            undefined,
            this.plugin.settings.webdav
          );
          const res = await client.checkConnectivity();
          if (res) {
            new Notice("Great! The webdav server can be accessed.");
          } else {
            new Notice("The webdav server cannot be reached.");
          }
        });
      });

    // we need to create chooser
    // after s3Div and webdavDiv being created
    new Setting(serviceChooserDiv)
      .setName("Choose service")
      .setDesc("Choose a service, by default s3")
      .addDropdown(async (dropdown) => {
        const currService = this.plugin.settings.serviceType;
        const enableExperimentService =
          this.plugin.settings.enableExperimentService;

        dropdown.addOption("s3", "s3 (-compatible)");
        dropdown.addOption("dropbox", "Dropbox");
        if (currService === "webdav" || enableExperimentService) {
          dropdown.addOption("webdav", "webdav (experimental)");
          if (!enableExperimentService) {
            this.plugin.settings.enableExperimentService = true;
            await this.plugin.saveSettings();
          }
        }
        dropdown
          .setValue(this.plugin.settings.serviceType)
          .onChange(async (val: SUPPORTED_SERVICES_TYPE) => {
            this.plugin.settings.serviceType = val;
            s3Div.toggleClass(
              "s3-hide",
              this.plugin.settings.serviceType !== "s3"
            );
            dropboxDiv.toggleClass(
              "dropbox-hide",
              this.plugin.settings.serviceType !== "dropbox"
            );
            webdavDiv.toggleClass(
              "webdav-hide",
              this.plugin.settings.serviceType !== "webdav"
            );
            await this.plugin.saveSettings();
          });
      });

    const debugDiv = containerEl.createEl("div");
    debugDiv.createEl("h2", { text: "Debug" });
    const syncPlanDiv = debugDiv.createEl("div");
    syncPlanDiv.createEl("p", {
      text: "Sync plans are created every time after you trigger sync and before the actual sync. Useful to know what would actually happen in those sync.",
    });

    new Setting(syncPlanDiv)
      .setName("export sync plans")
      .setDesc("export sync plans")
      .addButton(async (button) => {
        button.setButtonText("Export");
        button.onClick(async () => {
          await exportSyncPlansToFiles(this.plugin.db, this.app.vault);
          new Notice("sync plans history exported");
        });
      });

    new Setting(syncPlanDiv)
      .setName("delete sync plans history in db")
      .setDesc("delete sync plans history in db")
      .addButton(async (button) => {
        button.setButtonText("Delete History");
        button.onClick(async () => {
          await clearAllSyncPlanRecords(this.plugin.db);
          new Notice("sync plans history (in db) deleted");
        });
      });

    const syncMappingDiv = debugDiv.createEl("div");
    syncMappingDiv.createEl("p", {
      text: "Sync mappings history stores the actual LOCAL last modified time of the REMOTE objects. Clearing it may cause unnecessary data exchanges in next-time sync.",
    });

    new Setting(syncMappingDiv)
      .setName("delete sync mappings history in db")
      .setDesc("delete sync mappings history in db")
      .addButton(async (button) => {
        button.setButtonText("Delete Sync Mappings");
        button.onClick(async () => {
          await clearAllSyncMetaMapping(this.plugin.db);
          new Notice("sync mappings history (in local db) deleted");
        });
      });

    const dbsResetDiv = debugDiv.createEl("div");
    syncMappingDiv.createEl("p", {
      text: "Reset local internal caches/databases (for debugging purposes). You would want to reload the plugin after resetting this. This option will not empty the {s3, password...} settings.",
    });
    new Setting(syncMappingDiv)
      .setName("reset local internal cache/databases")
      .setDesc("reset local internal cache/databases")
      .addButton(async (button) => {
        button.setButtonText("Reset");
        button.onClick(async () => {
          await destroyDBs();
          new Notice(
            "Local internal cache/databases deleted. Please manually reload the plugin."
          );
        });
      });
  }
}
