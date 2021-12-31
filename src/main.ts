import { Modal, Notice, Plugin, Setting } from "obsidian";
import type { RemotelySavePluginSettings } from "./baseTypes";
import { COMMAND_CALLBACK, COMMAND_URI } from "./baseTypes";
import { importQrCodeUri } from "./importExport";
import type { InternalDBs } from "./localdb";
import {
  insertDeleteRecord,
  insertRenameRecord,
  insertSyncPlanRecord,
  loadDeleteRenameHistoryTable,
  prepareDBs,
} from "./localdb";
import { RemoteClient } from "./remote";
import { DEFAULT_DROPBOX_CONFIG } from "./remoteForDropbox";
import {
  AccessCodeResponseSuccessfulType,
  DEFAULT_ONEDRIVE_CONFIG,
  sendAuthReq as sendAuthReqOnedrive,
} from "./remoteForOnedrive";
import { DEFAULT_S3_CONFIG } from "./remoteForS3";
import { DEFAULT_WEBDAV_CONFIG } from "./remoteForWebdav";
import { RemotelySaveSettingTab } from "./settings";
import type { SyncStatusType } from "./sync";
import { doActualSync, getSyncPlan, isPasswordOk } from "./sync";

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  webdav: DEFAULT_WEBDAV_CONFIG,
  dropbox: DEFAULT_DROPBOX_CONFIG,
  onedrive: DEFAULT_ONEDRIVE_CONFIG,
  password: "",
  serviceType: "s3",
};

interface OAuth2Info {
  verifier?: string;
  helperModal?: Modal;
  authDiv?: HTMLElement;
  revokeDiv?: HTMLElement;
  revokeAuthSetting?: Setting;
}

export default class RemotelySavePlugin extends Plugin {
  settings: RemotelySavePluginSettings;
  // cm: CodeMirror.Editor;
  db: InternalDBs;
  syncStatus: SyncStatusType;
  oauth2Info: OAuth2Info;

  async onload() {
    console.log(`loading plugin ${this.manifest.id}`);

    this.oauth2Info = {
      verifier: "",
      helperModal: undefined,
      authDiv: undefined,
      revokeDiv: undefined,
      revokeAuthSetting: undefined,
    }; // init

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

    this.registerObsidianProtocolHandler(COMMAND_URI, async (inputParams) => {
      const parsed = importQrCodeUri(inputParams, this.app.vault.getName());
      if (parsed.status === "error") {
        new Notice(parsed.message);
      } else {
        const copied = JSON.parse(JSON.stringify(parsed.result));
        // new Notice(JSON.stringify(copied))
        this.settings = copied;
        this.saveSettings();
        new Notice(
          `New settings for ${this.manifest.name} saved. Reopen the plugin Settings to the effect.`
        );
      }
    });

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK,
      async (inputParams) => {
        new Notice(
          `Your uri call a callback that's not supported yet: ${JSON.stringify(
            inputParams
          )}`
        );
      }
    );
    this.registerObsidianProtocolHandler(
      "remotely-save-cb-onedrive",
      async (inputParams) => {
        if (inputParams.code !== undefined) {
          let rsp = await sendAuthReqOnedrive(
            this.settings.onedrive.clientID,
            this.settings.onedrive.authority,
            inputParams.code,
            this.oauth2Info.verifier
          );

          if ((rsp as any).error !== undefined) {
            throw Error(`${JSON.stringify(rsp)}`);
          }

          if (this.oauth2Info.helperModal !== undefined) {
            this.oauth2Info.helperModal.contentEl.empty();
            this.oauth2Info.helperModal.contentEl.createEl("p", {
              text: "Please wait, the plugin is trying to connect to Onedrive...",
            });
          }

          rsp = rsp as AccessCodeResponseSuccessfulType;
          this.settings.onedrive.accessToken = rsp.access_token;
          this.settings.onedrive.accessTokenExpiresAtTime =
            Date.now() + rsp.expires_in - 5 * 60 * 1000;
          this.settings.onedrive.accessTokenExpiresInSeconds = rsp.expires_in;
          this.settings.onedrive.refreshToken = rsp.refresh_token;
          this.saveSettings();

          const self = this;
          const client = new RemoteClient(
            "onedrive",
            undefined,
            undefined,
            undefined,
            this.settings.onedrive,
            this.app.vault.getName(),
            () => self.saveSettings()
          );
          this.settings.onedrive.username = await client.getUser();
          this.saveSettings();

          this.oauth2Info.verifier = ""; // reset it
          this.oauth2Info.helperModal?.close(); // close it
          this.oauth2Info.helperModal = undefined;

          this.oauth2Info.authDiv?.toggleClass(
            "onedrive-auth-button-hide",
            this.settings.onedrive.username !== ""
          );
          this.oauth2Info.authDiv = undefined;

          this.oauth2Info.revokeAuthSetting?.setDesc(
            `You've connected as user ${this.settings.dropbox.username}. If you want to disconnect, click this button.`
          );
          this.oauth2Info.revokeAuthSetting = undefined;
          this.oauth2Info.revokeDiv?.toggleClass(
            "onedrive-revoke-auth-button-hide",
            this.settings.onedrive.username === ""
          );
          this.oauth2Info.revokeDiv = undefined;
        } else {
          throw Error(
            `do not know how to deal with the callback: ${JSON.stringify(
              inputParams
            )}`
          );
        }
      }
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
          `1/7 Remotely Save Sync Preparing (${this.settings.serviceType})`
        );
        this.syncStatus = "preparing";

        new Notice("2/7 Starting to fetch remote meta data.");
        this.syncStatus = "getting_remote_meta";
        const self = this;
        const client = new RemoteClient(
          this.settings.serviceType,
          this.settings.s3,
          this.settings.webdav,
          this.settings.dropbox,
          this.settings.onedrive,
          this.app.vault.getName(),
          () => self.saveSettings()
        );
        const remoteRsp = await client.listFromRemote();
        // console.log(remoteRsp);

        new Notice("3/7 Starting to fetch local meta data.");
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

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   console.log("click", evt);
    // });

    // this.registerInterval(
    //   window.setInterval(() => console.log("setInterval"), 5 * 60 * 1000)
    // );
  }

  onunload() {
    console.log(`unloading plugin ${this.manifest.id}`);
    this.destroyDBs();
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) /* copy an object */,
      await this.loadData()
    );
    if (this.settings.dropbox.clientID === "") {
      this.settings.dropbox.clientID = DEFAULT_SETTINGS.dropbox.clientID;
    }
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
