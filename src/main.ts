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
import {
  DEFAULT_S3_CONFIG,
  getS3Client,
  listFromRemote,
  S3Config,
  checkS3Connectivity,
} from "./s3";
import { exportSyncPlansToFiles } from "./debugMode";

interface RemotelySavePluginSettings {
  s3?: S3Config;
  password?: string;
}

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  password: "",
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
        new Notice("1/6 Remotely Save Sync Preparing");
        this.syncStatus = "preparing";

        new Notice("2/6 Starting to fetch remote meta data.");
        this.syncStatus = "getting_remote_meta";
        const s3Client = getS3Client(this.settings.s3);
        const remoteRsp = await listFromRemote(s3Client, this.settings.s3);

        new Notice("3/6 Starting to fetch local meta data.");
        this.syncStatus = "getting_local_meta";
        const local = this.app.vault.getAllLoadedFiles();
        const localHistory = await loadDeleteRenameHistoryTable(this.db);
        // console.log(remoteRsp);
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
          this.settings.password
        );
        console.log(syncPlan.mixedStates); // for debugging
        await insertSyncPlanRecord(this.db, syncPlan);

        // The operations above are read only and kind of safe.
        // The operations below begins to write or delete (!!!) something.

        new Notice("6/7 Remotely Save Sync data exchanging!");

        this.syncStatus = "syncing";
        await doActualSync(
          s3Client,
          this.settings.s3,
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
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
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

    const s3Div = containerEl.createEl("div");
    s3Div.createEl("h2", { text: "S3 (-compatible) Service" });

    s3Div.createEl("p", {
      text: "You can use Amazon S3 or another S3-compatible service to sync your vault. Enter your bucket information below.",
    });

    s3Div.createEl("p", {
      text: "Disclaimer: The infomation is stored in PLAIN TEXT locally. Other malicious/harmful/faulty plugins may or may not be able to read the info. If you see any unintentional access to your S3 bucket, please immediately delete the access key to stop further accessment.",
      cls: "s3-disclaimer",
    });

    s3Div.createEl("p", {
      text: "You need to configure CORS to allow requests from origin app://obsidian.md and capacitor://localhost",
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
          const s3Client = getS3Client(this.plugin.settings.s3);
          const res = await checkS3Connectivity(
            s3Client,
            this.plugin.settings.s3
          );
          if (res) {
            new Notice("Great! The bucket can be accessed.");
          } else {
            new Notice("The S3 bucket cannot be reached.");
          }
        });
      });

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
