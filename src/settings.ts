import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import type { SUPPORTED_SERVICES_TYPE, WebdavAuthType } from "./baseTypes";
import { exportVaultSyncPlansToFiles } from "./debugMode";
import { exportQrCodeUri } from "./importExport";
import {
  clearAllSyncMetaMapping,
  clearAllSyncPlanRecords,
  destroyDBs,
} from "./localdb";
import type RemotelySavePlugin from "./main"; // unavoidable
import { RemoteClient } from "./remote";
import {
  DEFAULT_DROPBOX_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierDropbox,
  sendAuthReq as sendAuthReqDropbox,
  setConfigBySuccessfullAuthInplace,
} from "./remoteForDropbox";
import {
  DEFAULT_ONEDRIVE_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierOnedrive,
} from "./remoteForOnedrive";
import { messyConfigToNormal } from "./configPersist";

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

class PasswordModal extends Modal {
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
      text: "If the field is not empty, files would be encrypted locally before being uploaded.",
    });
    contentEl.createEl("p", {
      text: "If the field is empty, then files would be uploaded without encryption.",
    });

    contentEl.createEl("p", {
      text: "Attention 1/5: The vault name is NOT encrypted. The plugin creates a folder with the vault name on some remote services.",
      cls: "password-disclaimer",
    });
    contentEl.createEl("p", {
      text: "Attention 2/5: The password itself is stored in PLAIN TEXT LOCALLY.",
      cls: "password-disclaimer",
    });
    contentEl.createEl("p", {
      text: "Attention 3/5: Some metadata are not encrypted or can be easily guessed. (File sizes are closed to their unencrypted ones, and directory path may be stored as 0-byte-size object.)",
      cls: "password-disclaimer",
    });
    contentEl.createEl("p", {
      text: "Attention 4/5: You should make sure the remote store IS EMPTY, or REMOTE FILES WERE ENCRYPTED BY THAT NEW PASSWORD, to avoid conflictions.",
    });
    contentEl.createEl("p", {
      text: "Attention 5/5: The longer the password, the better.",
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
        button.setClass("password-second-confirm");
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

class DropboxAuthModal extends Modal {
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

  async onOpen() {
    let { contentEl } = this;

    const { authUrl, verifier } = await getAuthUrlAndVerifierDropbox(
      this.plugin.settings.dropbox.clientID
    );
    this.plugin.oauth2Info.verifier = verifier;

    contentEl.createEl("p", {
      text: "Visit the address in a browser, and follow the steps.",
    });
    contentEl.createEl("p", {
      text: "Finally you should be redirected to Obsidian.",
    });

    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: "Click to copy the auth url",
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice("the auth url copied to clipboard!");
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

export class OnedriveAuthModal extends Modal {
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

  async onOpen() {
    let { contentEl } = this;

    const { authUrl, verifier } = await getAuthUrlAndVerifierOnedrive(
      this.plugin.settings.onedrive.clientID,
      this.plugin.settings.onedrive.authority
    );
    this.plugin.oauth2Info.verifier = verifier;

    contentEl.createEl("p", {
      text: "Currently only OneDrive for personal is supported. OneDrive for Business is NOT supported (yet).",
    });

    contentEl.createEl("p", {
      text: "Visit the address in a browser, and follow the steps.",
    });
    contentEl.createEl("p", {
      text: "Finally you should be redirected to Obsidian.",
    });

    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: "Click to copy the auth url",
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice("the auth url copied to clipboard!");
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

export class OnedriveRevokeAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
  }

  async onOpen() {
    let { contentEl } = this;
    contentEl.createEl("p", {
      text: 'Step 1: Go to the following address, click the "Edit" button for the plugin, then click "Remove these permissions" button on the page.',
    });
    const consentUrl = "https://microsoft.com/consent";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: "Step 2: Click the button below, to clean the locally-saved login credentials.",
    });

    new Setting(contentEl)
      .setName("Clean Locally-Saved Login Credentials")
      .setDesc("You need to click the button.")
      .addButton(async (button) => {
        button.setButtonText("Clean");
        button.onClick(async () => {
          try {
            this.plugin.settings.onedrive = JSON.parse(
              JSON.stringify(DEFAULT_ONEDRIVE_CONFIG)
            );
            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "onedrive-auth-button-hide",
              this.plugin.settings.onedrive.username !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "onedrive-revoke-auth-button-hide",
              this.plugin.settings.onedrive.username === ""
            );
            new Notice("Cleaned!");
            this.close();
          } catch (err) {
            console.error(err);
            new Notice("Something goes wrong while revoking");
          }
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class ExportSettingsQrCodeModal extends Modal {
  plugin: RemotelySavePlugin;
  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    let { contentEl } = this;

    const { rawUri, imgUri } = await exportQrCodeUri(
      this.plugin.settings,
      this.app.vault.getName(),
      this.plugin.manifest.version
    );

    const div1 = contentEl.createDiv();
    div1.createEl("p", {
      text: "This exports not-oauth2 settings. (It means that Dropbox, OneDrive info are NOT exported.)",
    });
    div1.createEl("p", {
      text: "You can use another device to scan this qrcode.",
    });
    div1.createEl("p", {
      text: "Or, you can click the button to copy the special url.",
    });

    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: "Click to copy the special URI",
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(rawUri);
          new Notice("special uri copied to clipboard!");
        };
      }
    );

    const div3 = contentEl.createDiv();
    div3.createEl(
      "img",
      {
        cls: "qrcode-img",
      },
      async (el) => {
        el.src = imgUri;
      }
    );
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

export class RemotelySaveSettingTab extends PluginSettingTab {
  plugin: RemotelySavePlugin;

  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    containerEl.createEl("h1", { text: "Remotely Save" });

    //////////////////////////////////////////////////
    // below for general
    //////////////////////////////////////////////////

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

    const scheduleDiv = generalDiv.createEl("div");
    new Setting(scheduleDiv)
      .setName("schedule for auto run")
      .setDesc(
        "The plugin trys to schedule the running after every interval. Battery may be impacted."
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", "(no auto run)");
        dropdown.addOption(`${1000 * 60 * 1}`, "every 1 minute");
        dropdown.addOption(`${1000 * 60 * 5}`, "every 5 minutes");
        dropdown.addOption(`${1000 * 60 * 10}`, "every 10 minutes");
        dropdown.addOption(`${1000 * 60 * 30}`, "every 30 minutes");

        dropdown
          .setValue(`${this.plugin.settings.autoRunEveryMilliseconds}`)
          .onChange(async (val: string) => {
            const realVal = parseInt(val);
            this.plugin.settings.autoRunEveryMilliseconds = realVal;
            await this.plugin.saveSettings();
            if (
              (realVal === undefined || realVal === null || realVal <= 0) &&
              this.plugin.autoRunIntervalID !== undefined
            ) {
              // clear
              window.clearInterval(this.plugin.autoRunIntervalID);
              this.plugin.autoRunIntervalID = undefined;
            } else if (
              realVal !== undefined &&
              realVal !== null &&
              realVal > 0
            ) {
              const intervalID = window.setInterval(() => {
                this.plugin.syncRun("auto");
              }, realVal);
              this.plugin.autoRunIntervalID = intervalID;
              this.plugin.registerInterval(intervalID);
            }
          });
      });

    //////////////////////////////////////////////////
    // below for general chooser (part 1/2)
    //////////////////////////////////////////////////

    // we need to create the div in advance of any other service divs
    const serviceChooserDiv = generalDiv.createEl("div");

    //////////////////////////////////////////////////
    // below for s3
    //////////////////////////////////////////////////

    const s3Div = containerEl.createEl("div", { cls: "s3-hide" });
    s3Div.toggleClass("s3-hide", this.plugin.settings.serviceType !== "s3");
    s3Div.createEl("h2", { text: "Remote For S3 or compatible" });

    s3Div.createEl("p", {
      text: "Disclaimer: This plugin is NOT an official Amazon product.",
      cls: "s3-disclaimer",
    });

    s3Div.createEl("p", {
      text: "Disclaimer: The information is stored in locally. Other malicious/harmful/faulty plugins could read the info. If you see any unintentional access to your bucket, please immediately delete the access key on your AWS (or other S3-service provider) settings.",
      cls: "s3-disclaimer",
    });

    s3Div.createEl("p", {
      text: "You need to configure CORS to allow requests from origin app://obsidian.md and capacitor://localhost and http://localhost",
    });

    s3Div.createEl("p", {
      text: "Some Amazon S3 official docs for references:",
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
      .setDesc(
        "s3Region: If you are not sure what to enter, you could try the value: us-east-1"
      )
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
      .setName("s3 URL Style")
      .setDesc("Whether to use virtual-hosted style URLs (e.g. https://bucket.s3.amazonaws.com/) or path style URLs (e.g. https://s3.amazonaws.com/bucket/) for S3 objects.")
      .addDropdown((dropdown) => {
        dropdown.addOption("virtualHostedStyle", "Virtual Hosted Style");
        dropdown.addOption("pathStyle", "Path Style");
        dropdown
          .setValue(this.plugin.settings.s3.forcePathStyle ? "pathStyle": "virtualHostedStyle")
          .onChange(async (val: string) => {
            this.plugin.settings.s3.forcePathStyle = (val == "pathStyle");
            await this.plugin.saveSettings();
          });
      });

    new Setting(s3Div)
      .setName("check connectivity")
      .setDesc("check connectivity")
      .addButton(async (button) => {
        button.setButtonText("Check");
        button.onClick(async () => {
          new Notice("Checking...");
          const client = new RemoteClient("s3", this.plugin.settings.s3);
          const res = await client.checkConnectivity();
          if (res) {
            new Notice("Great! The bucket can be accessed.");
          } else {
            new Notice("The S3 bucket cannot be reached.");
          }
        });
      });

    //////////////////////////////////////////////////
    // below for dropbpx
    //////////////////////////////////////////////////

    const dropboxDiv = containerEl.createEl("div", { cls: "dropbox-hide" });
    dropboxDiv.toggleClass(
      "dropbox-hide",
      this.plugin.settings.serviceType !== "dropbox"
    );
    dropboxDiv.createEl("h2", { text: "Remote For Dropbox" });
    dropboxDiv.createEl("p", {
      text: "Disclaimer: This app is NOT an official Dropbox product.",
      cls: "dropbox-disclaimer",
    });
    dropboxDiv.createEl("p", {
      text: "Disclaimer: The information is stored in locally. Other malicious/harmful/faulty plugins could read the info. If you see any unintentional access to your Dropbox, please immediately disconnect this app on https://www.dropbox.com/account/connected_apps .",
      cls: "dropbox-disclaimer",
    });
    dropboxDiv.createEl("p", {
      text: `We will create and sync inside the folder /Apps/${
        this.plugin.manifest.id
      }/${this.app.vault.getName()} on your Dropbox.`,
    });

    const dropboxSelectAuthDiv = dropboxDiv.createDiv();
    const dropboxAuthDiv = dropboxSelectAuthDiv.createDiv({
      cls: "dropbox-auth-button-hide",
    });
    const dropboxRevokeAuthDiv = dropboxSelectAuthDiv.createDiv({
      cls: "dropbox-revoke-auth-button-hide",
    });

    const dropboxRevokeAuthSetting = new Setting(dropboxRevokeAuthDiv)
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
              undefined,
              this.app.vault.getName(),
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
          const modal = new DropboxAuthModal(
            this.app,
            this.plugin,
            dropboxAuthDiv,
            dropboxRevokeAuthDiv,
            dropboxRevokeAuthSetting
          );
          this.plugin.oauth2Info.helperModal = modal;
          this.plugin.oauth2Info.authDiv = dropboxAuthDiv;
          this.plugin.oauth2Info.revokeDiv = dropboxRevokeAuthDiv;
          this.plugin.oauth2Info.revokeAuthSetting = dropboxRevokeAuthSetting;
          modal.open();
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
            undefined,
            this.app.vault.getName(),
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

    //////////////////////////////////////////////////
    // below for onedrive
    //////////////////////////////////////////////////

    const onedriveDiv = containerEl.createEl("div", { cls: "onedrive-hide" });
    onedriveDiv.toggleClass(
      "onedrive-hide",
      this.plugin.settings.serviceType !== "onedrive"
    );
    onedriveDiv.createEl("h2", { text: "Remote For Onedrive (for personal)" });
    onedriveDiv.createEl("p", {
      text: "Disclaimer: This app is NOT an official Microsoft / Onedrive product.",
      cls: "onedrive-disclaimer",
    });
    onedriveDiv.createEl("p", {
      text: "Disclaimer: The information is stored locally. Other malicious/harmful/faulty plugins could read the info. If you see any unintentional access to your Onedrive, please immediately disconnect this app on https://microsoft.com/consent .",
      cls: "onedrive-disclaimer",
    });
    onedriveDiv.createEl("p", {
      text: `We will create and sync inside the folder /Apps/${
        this.plugin.manifest.id
      }/${this.app.vault.getName()} on your Onedrive.`,
    });

    onedriveDiv.createEl("p", {
      text: "Currently only OneDrive for personal is supported. OneDrive for Business is NOT supported (yet).",
    });

    const onedriveSelectAuthDiv = onedriveDiv.createDiv();
    const onedriveAuthDiv = onedriveSelectAuthDiv.createDiv({
      cls: "onedrive-auth-button-hide",
    });
    const onedriveRevokeAuthDiv = onedriveSelectAuthDiv.createDiv({
      cls: "onedrive-revoke-auth-button-hide",
    });

    const onedriveRevokeAuthSetting = new Setting(onedriveRevokeAuthDiv)
      .setName("Revoke Auth")
      .setDesc(
        `You've connected as user ${this.plugin.settings.onedrive.username}. If you want to disconnect, click this button`
      )
      .addButton(async (button) => {
        button.setButtonText("Revoke Auth");
        button.onClick(async () => {
          new OnedriveRevokeAuthModal(
            this.app,
            this.plugin,
            onedriveAuthDiv,
            onedriveRevokeAuthDiv
          ).open();
        });
      });

    new Setting(onedriveAuthDiv)
      .setName("Auth")
      .setDesc("Auth")
      .addButton(async (button) => {
        button.setButtonText("Auth");
        button.onClick(async () => {
          const modal = new OnedriveAuthModal(
            this.app,
            this.plugin,
            onedriveAuthDiv,
            onedriveRevokeAuthDiv,
            onedriveRevokeAuthSetting
          );
          this.plugin.oauth2Info.helperModal = modal;
          this.plugin.oauth2Info.authDiv = onedriveAuthDiv;
          this.plugin.oauth2Info.revokeDiv = onedriveRevokeAuthDiv;
          this.plugin.oauth2Info.revokeAuthSetting = onedriveRevokeAuthSetting;
          modal.open();
        });
      });

    onedriveAuthDiv.toggleClass(
      "onedrive-auth-button-hide",
      this.plugin.settings.onedrive.username !== ""
    );
    onedriveRevokeAuthDiv.toggleClass(
      "onedrive-revoke-auth-button-hide",
      this.plugin.settings.onedrive.username === ""
    );

    new Setting(onedriveDiv)
      .setName("check connectivity")
      .setDesc("check connectivity")
      .addButton(async (button) => {
        button.setButtonText("Check");
        button.onClick(async () => {
          new Notice("Checking...");
          const self = this;
          const client = new RemoteClient(
            "onedrive",
            undefined,
            undefined,
            undefined,
            this.plugin.settings.onedrive,
            this.app.vault.getName(),
            () => self.plugin.saveSettings()
          );

          const res = await client.checkConnectivity();
          if (res) {
            new Notice("Great! We can connect to Onedrive!");
          } else {
            new Notice("We cannot connect to Onedrive.");
          }
        });
      });

    //////////////////////////////////////////////////
    // below for webdav
    //////////////////////////////////////////////////

    const webdavDiv = containerEl.createEl("div", { cls: "webdav-hide" });
    webdavDiv.toggleClass(
      "webdav-hide",
      this.plugin.settings.serviceType !== "webdav"
    );

    webdavDiv.createEl("h2", { text: "Remote For Webdav" });

    webdavDiv.createEl("p", {
      text: "Disclaimer: The information is stored in locally. Other malicious/harmful/faulty plugins may read the info. If you see any unintentional access to your webdav server, please immediately change the username and password.",
      cls: "webdav-disclaimer",
    });

    webdavDiv.createEl("p", {
      text: "You need to configure CORS to allow requests from origin app://obsidian.md and capacitor://localhost and http://localhost",
    });

    webdavDiv.createEl("p", {
      text: `We will create and sync inside the folder /${this.app.vault.getName()} on your server.`,
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
      .setDesc("If no password, this option would be ignored.")
      .addDropdown((dropdown) => {
        dropdown.addOption("basic", "basic");
        // dropdown.addOption("digest", "digest");

        dropdown
          .setValue(this.plugin.settings.webdav.authType)
          .onChange(async (val: WebdavAuthType) => {
            this.plugin.settings.webdav.authType = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName("server supports infinity propfind or not")
      .setDesc(
        "The plugin needs to get all files and folders recursively using probfind. If your webdav server only supports depth='1' (such as NGINX), you need to adjust the setting here, then the plugin consumes more network requests, but better than not working."
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("infinity", "supports depth='infinity'");
        dropdown.addOption("1", "only supports depth='1'");

        type Depth = "1" | "infinity";
        dropdown
          .setValue(
            this.plugin.settings.webdav.manualRecursive === false
              ? "infinity"
              : "1"
          )
          .onChange(async (val: Depth) => {
            if (val === "1") {
              this.plugin.settings.webdav.manualRecursive = true;
            } else if (val === "infinity") {
              this.plugin.settings.webdav.manualRecursive = false;
            }
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
            this.plugin.settings.webdav,
            undefined,
            undefined,
            this.app.vault.getName()
          );
          const res = await client.checkConnectivity();
          if (res) {
            new Notice("Great! The webdav server can be accessed.");
          } else {
            new Notice(
              "The webdav server cannot be reached (possible to be any of address/username/password/authtype/CORS errors)."
            );
          }
        });
      });

    //////////////////////////////////////////////////
    // below for general chooser (part 2/2)
    //////////////////////////////////////////////////

    // we need to create chooser
    // after all service-div-s being created
    new Setting(serviceChooserDiv)
      .setName("Choose service")
      .setDesc("Choose a service.")
      .addDropdown(async (dropdown) => {
        dropdown.addOption("s3", "S3 or compatible");
        dropdown.addOption("dropbox", "Dropbox");
        dropdown.addOption("webdav", "Webdav (beta)");
        dropdown.addOption("onedrive", "OneDrive for personal (alpha)");
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
            onedriveDiv.toggleClass(
              "onedrive-hide",
              this.plugin.settings.serviceType !== "onedrive"
            );
            webdavDiv.toggleClass(
              "webdav-hide",
              this.plugin.settings.serviceType !== "webdav"
            );
            await this.plugin.saveSettings();
          });
      });

    //////////////////////////////////////////////////
    // below for import and export functions
    //////////////////////////////////////////////////

    // import and export
    const importExportDiv = containerEl.createEl("div");
    importExportDiv.createEl("h2", {
      text: "Import and Export Partial Settings",
    });

    new Setting(importExportDiv)
      .setName("export")
      .setDesc("Export not-oauth2 settings by generating a qrcode.")
      .addButton(async (button) => {
        button.setButtonText("Get QR Code");
        button.onClick(async () => {
          new ExportSettingsQrCodeModal(this.app, this.plugin).open();
        });
      });

    new Setting(importExportDiv)
      .setName("import")
      .setDesc(
        "You should open a camera or scan-qrcode app, to manually scan the QR code."
      );

    //////////////////////////////////////////////////
    // below for debug
    //////////////////////////////////////////////////

    const debugDiv = containerEl.createEl("div");
    debugDiv.createEl("h2", { text: "Debug" });

    const setConsoleLogLevelDiv = debugDiv.createDiv("div");
    new Setting(setConsoleLogLevelDiv)
      .setName("alter console log level")
      .setDesc(
        'By default the log level is "info". You can change to "debug" to get verbose infomation in console.'
      )
      .addDropdown(async (dropdown) => {
        dropdown.addOption("info", "info");
        dropdown.addOption("debug", "debug");
        dropdown
          .setValue(this.plugin.settings.currLogLevel)
          .onChange(async (val: string) => {
            this.plugin.settings.currLogLevel = val;
            log.setLevel(val as any);
            await this.plugin.saveSettings();
            log.info(`the log level is changed to ${val}`);
          });
      });
    const outputCurrSettingsDiv = debugDiv.createDiv("div");
    new Setting(outputCurrSettingsDiv)
      .setName("output current settings from disk to console")
      .setDesc(
        "The settings save on disk in encoded. Click this to see the decoded settings in console."
      )
      .addButton(async (button) => {
        button.setButtonText("Output");
        button.onClick(async () => {
          const c = messyConfigToNormal(await this.plugin.loadData());
          if (c.currLogLevel === "debug") {
            // no need to ouput it again because debug mode already output it
          } else {
            log.info(c);
          }
          new Notice("Finished outputing in console.");
        });
      });
    const syncPlanDiv = debugDiv.createEl("div");
    new Setting(syncPlanDiv)
      .setName("export sync plans")
      .setDesc(
        "Sync plans are created every time after you trigger sync and before the actual sync. Useful to know what would actually happen in those sync. Click the button to export sync plans"
      )
      .addButton(async (button) => {
        button.setButtonText("Export");
        button.onClick(async () => {
          await exportVaultSyncPlansToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.settings.vaultRandomID
          );
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
    new Setting(syncMappingDiv)
      .setName("delete sync mappings history in db")
      .setDesc(
        "Sync mappings history stores the actual LOCAL last modified time of the REMOTE objects. Clearing it may cause unnecessary data exchanges in next-time sync. Click the button to delete sync mappings history in db"
      )
      .addButton(async (button) => {
        button.setButtonText("Delete Sync Mappings");
        button.onClick(async () => {
          await clearAllSyncMetaMapping(this.plugin.db);
          new Notice("sync mappings history (in local db) deleted");
        });
      });

    const dbsResetDiv = debugDiv.createEl("div");
    new Setting(dbsResetDiv)
      .setName("reset local internal cache/databases")
      .setDesc(
        "Reset local internal caches/databases (for debugging purposes). You would want to reload the plugin after resetting this. This option will not empty the {s3, password...} settings."
      )
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
