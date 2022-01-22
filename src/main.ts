import { Modal, Notice, Plugin, Setting, addIcon, setIcon } from "obsidian";
import cloneDeep from "lodash/cloneDeep";
import { nanoid } from "nanoid";
import feather from "feather-icons";
import type { RemotelySavePluginSettings } from "./baseTypes";
import {
  COMMAND_CALLBACK,
  COMMAND_CALLBACK_ONEDRIVE,
  COMMAND_CALLBACK_DROPBOX,
  COMMAND_URI,
} from "./baseTypes";
import { importQrCodeUri } from "./importExport";
import type { InternalDBs } from "./localdb";
import {
  insertDeleteRecordByVault,
  insertRenameRecordByVault,
  insertSyncPlanRecordByVault,
  loadDeleteRenameHistoryTableByVault,
  prepareDBs,
} from "./localdb";
import { RemoteClient } from "./remote";
import {
  DEFAULT_DROPBOX_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierDropbox,
  sendAuthReq as sendAuthReqDropbox,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceDropbox,
} from "./remoteForDropbox";
import {
  AccessCodeResponseSuccessfulType,
  DEFAULT_ONEDRIVE_CONFIG,
  sendAuthReq as sendAuthReqOnedrive,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceOnedrive,
} from "./remoteForOnedrive";
import { DEFAULT_S3_CONFIG } from "./remoteForS3";
import { DEFAULT_WEBDAV_CONFIG } from "./remoteForWebdav";
import { RemotelySaveSettingTab } from "./settings";
import type { SyncStatusType } from "./sync";
import { doActualSync, getSyncPlan, isPasswordOk } from "./sync";
import { messyConfigToNormal, normalConfigToMessy } from "./configPersist";

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  webdav: DEFAULT_WEBDAV_CONFIG,
  dropbox: DEFAULT_DROPBOX_CONFIG,
  onedrive: DEFAULT_ONEDRIVE_CONFIG,
  password: "",
  serviceType: "s3",
  currLogLevel: "info",
  vaultRandomID: "",
  autoRunEveryMilliseconds: -1,
};

interface OAuth2Info {
  verifier?: string;
  helperModal?: Modal;
  authDiv?: HTMLElement;
  revokeDiv?: HTMLElement;
  revokeAuthSetting?: Setting;
}

type SyncTriggerSourceType = "manual" | "auto";

const iconNameSyncWait = `remotely-save-sync-wait`;
const iconNameSyncRunning = `remotely-save-sync-running`;
const iconSvgSyncWait = feather.icons["rotate-ccw"].toSvg({
  width: 100,
  height: 100,
});
const iconSvgSyncRunning = feather.icons["refresh-ccw"].toSvg({
  width: 100,
  height: 100,
});

export default class RemotelySavePlugin extends Plugin {
  settings: RemotelySavePluginSettings;
  // cm: CodeMirror.Editor;
  db: InternalDBs;
  syncStatus: SyncStatusType;
  oauth2Info: OAuth2Info;
  currLogLevel: string;
  currSyncMsg?: string;
  syncRibbon?: HTMLElement;
  autoRunIntervalID?: number;

  async syncRun(triggerSource: SyncTriggerSourceType = "manual") {
    const getNotice = (x: string) => {
      // only show notices in manual mode
      // no notice in auto mode
      if (triggerSource === "manual") {
        new Notice(x);
      }
    };
    if (this.syncStatus !== "idle") {
      // here the notice is shown regardless of triggerSource
      new Notice(`Remotely Save already running in stage ${this.syncStatus}!`);
      if (this.currSyncMsg !== undefined && this.currSyncMsg !== "") {
        new Notice(this.currSyncMsg);
      }
      return;
    }

    let originLabel = `${this.manifest.name}`;
    if (this.syncRibbon !== undefined) {
      originLabel = this.syncRibbon.getAttribute("aria-label");
    }

    try {
      log.info(
        `${
          this.manifest.id
        }-${Date.now()}: start sync, triggerSource=${triggerSource}`
      );

      if (this.syncRibbon !== undefined) {
        setIcon(this.syncRibbon, iconNameSyncRunning);
        this.syncRibbon.setAttribute(
          "aria-label",
          `${this.manifest.name}: ${triggerSource} syncing`
        );
      }

      //log.info(`huh ${this.settings.password}`)
      getNotice(
        `1/7 Remotely Save Sync Preparing (${this.settings.serviceType})`
      );
      this.syncStatus = "preparing";

      getNotice("2/7 Starting to fetch remote meta data.");
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
      log.info(remoteRsp);

      getNotice("3/7 Starting to fetch local meta data.");
      this.syncStatus = "getting_local_meta";
      const local = this.app.vault.getAllLoadedFiles();
      const localHistory = await loadDeleteRenameHistoryTableByVault(
        this.db,
        this.settings.vaultRandomID
      );
      // log.info(local);
      // log.info(localHistory);

      getNotice("4/7 Checking password correct or not.");
      this.syncStatus = "checking_password";
      const passwordCheckResult = await isPasswordOk(
        remoteRsp.Contents,
        this.settings.password
      );
      if (!passwordCheckResult.ok) {
        getNotice("something goes wrong while checking password");
        throw Error(passwordCheckResult.reason);
      }

      getNotice("5/7 Starting to generate sync plan.");
      this.syncStatus = "generating_plan";
      const syncPlan = await getSyncPlan(
        remoteRsp.Contents,
        local,
        localHistory,
        this.db,
        this.settings.vaultRandomID,
        client.serviceType,
        this.settings.password
      );
      log.info(syncPlan.mixedStates); // for debugging
      await insertSyncPlanRecordByVault(
        this.db,
        syncPlan,
        this.settings.vaultRandomID
      );

      // The operations above are read only and kind of safe.
      // The operations below begins to write or delete (!!!) something.

      getNotice("6/7 Remotely Save Sync data exchanging!");

      this.syncStatus = "syncing";
      await doActualSync(
        client,
        this.db,
        this.settings.vaultRandomID,
        this.app.vault,
        syncPlan,
        this.settings.password,
        (i: number, totalCount: number, pathName: string, decision: string) =>
          self.setCurrSyncMsg(i, totalCount, pathName, decision)
      );

      getNotice("7/7 Remotely Save finish!");
      this.currSyncMsg = "";
      this.syncStatus = "finish";
      this.syncStatus = "idle";

      if (this.syncRibbon !== undefined) {
        setIcon(this.syncRibbon, iconNameSyncWait);
        this.syncRibbon.setAttribute("aria-label", originLabel);
      }

      log.info(
        `${
          this.manifest.id
        }-${Date.now()}: finish sync, triggerSource=${triggerSource}`
      );
    } catch (error) {
      const msg = `${
        this.manifest.id
      }-${Date.now()}: abort sync, triggerSource=${triggerSource}, error while ${
        this.syncStatus
      }`;
      log.info(msg);
      log.info(error);
      getNotice(msg);
      getNotice(error.message);
      this.syncStatus = "idle";
      if (this.syncRibbon !== undefined) {
        setIcon(this.syncRibbon, iconNameSyncWait);
        this.syncRibbon.setAttribute("aria-label", originLabel);
      }
    }
  }

  async onload() {
    log.info(`loading plugin ${this.manifest.id}`);

    addIcon(iconNameSyncWait, iconSvgSyncWait);
    addIcon(iconNameSyncRunning, iconSvgSyncRunning);

    this.oauth2Info = {
      verifier: "",
      helperModal: undefined,
      authDiv: undefined,
      revokeDiv: undefined,
      revokeAuthSetting: undefined,
    }; // init

    this.currSyncMsg = "";

    await this.loadSettings();

    if (this.settings.currLogLevel !== undefined) {
      log.setLevel(this.settings.currLogLevel as any);
    }

    await this.checkIfOauthExpires();
    await this.checkIfVaultIDAssigned(); // MUST before prepareDB()

    await this.prepareDB();

    this.syncStatus = "idle";

    this.registerEvent(
      this.app.vault.on("delete", async (fileOrFolder) => {
        await insertDeleteRecordByVault(
          this.db,
          fileOrFolder,
          this.settings.vaultRandomID
        );
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (fileOrFolder, oldPath) => {
        await insertRenameRecordByVault(
          this.db,
          fileOrFolder,
          oldPath,
          this.settings.vaultRandomID
        );
      })
    );

    this.registerObsidianProtocolHandler(COMMAND_URI, async (inputParams) => {
      const parsed = importQrCodeUri(inputParams, this.app.vault.getName());
      if (parsed.status === "error") {
        new Notice(parsed.message);
      } else {
        const copied = cloneDeep(parsed.result);
        // new Notice(JSON.stringify(copied))
        this.settings = Object.assign({}, this.settings, copied);
        this.saveSettings();
        new Notice(
          `New not-oauth2 settings for ${this.manifest.name} saved. Reopen the plugin Settings to the effect.`
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
      COMMAND_CALLBACK_DROPBOX,
      async (inputParams) => {
        if (inputParams.code !== undefined) {
          if (this.oauth2Info.helperModal !== undefined) {
            this.oauth2Info.helperModal.contentEl.empty();
            this.oauth2Info.helperModal.contentEl.createEl("p", {
              text: "Connecting to Dropbox...",
            });
            this.oauth2Info.helperModal.contentEl.createEl("p", {
              text: "Please DO NOT close this modal.",
            });
          }

          let authRes = await sendAuthReqDropbox(
            this.settings.dropbox.clientID,
            this.oauth2Info.verifier,
            inputParams.code
          );

          const self = this;
          setConfigBySuccessfullAuthInplaceDropbox(
            this.settings.dropbox,
            authRes,
            () => self.saveSettings()
          );

          const client = new RemoteClient(
            "dropbox",
            undefined,
            undefined,
            this.settings.dropbox,
            undefined,
            this.app.vault.getName(),
            () => self.saveSettings()
          );

          const username = await client.getUser();
          this.settings.dropbox.username = username;
          await this.saveSettings();

          new Notice(`Good! We've connected to Dropbox as user ${username}!`);

          this.oauth2Info.verifier = ""; // reset it
          this.oauth2Info.helperModal?.close(); // close it
          this.oauth2Info.helperModal = undefined;

          this.oauth2Info.authDiv?.toggleClass(
            "dropbox-auth-button-hide",
            this.settings.dropbox.username !== ""
          );
          this.oauth2Info.authDiv = undefined;

          this.oauth2Info.revokeAuthSetting?.setDesc(
            `You've connected as user ${this.settings.dropbox.username}. If you want to disconnect, click this button.`
          );
          this.oauth2Info.revokeAuthSetting = undefined;
          this.oauth2Info.revokeDiv?.toggleClass(
            "dropbox-revoke-auth-button-hide",
            this.settings.dropbox.username === ""
          );
          this.oauth2Info.revokeDiv = undefined;
        } else {
          new Notice(
            "Something went wrong from response from Dropbox. Maybe you rejected the auth?"
          );
          throw Error(
            `do not know how to deal with the callback: ${JSON.stringify(
              inputParams
            )}`
          );
        }
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_ONEDRIVE,
      async (inputParams) => {
        if (inputParams.code !== undefined) {
          if (this.oauth2Info.helperModal !== undefined) {
            this.oauth2Info.helperModal.contentEl.empty();
            this.oauth2Info.helperModal.contentEl.createEl("p", {
              text: "Connecting to Onedrive...",
            });
            this.oauth2Info.helperModal.contentEl.createEl("p", {
              text: "Please DO NOT close this modal.",
            });
          }

          let rsp = await sendAuthReqOnedrive(
            this.settings.onedrive.clientID,
            this.settings.onedrive.authority,
            inputParams.code,
            this.oauth2Info.verifier
          );

          if ((rsp as any).error !== undefined) {
            throw Error(`${JSON.stringify(rsp)}`);
          }

          const self = this;
          setConfigBySuccessfullAuthInplaceOnedrive(
            this.settings.onedrive,
            rsp as AccessCodeResponseSuccessfulType,
            () => self.saveSettings()
          );

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
          await this.saveSettings();

          this.oauth2Info.verifier = ""; // reset it
          this.oauth2Info.helperModal?.close(); // close it
          this.oauth2Info.helperModal = undefined;

          this.oauth2Info.authDiv?.toggleClass(
            "onedrive-auth-button-hide",
            this.settings.onedrive.username !== ""
          );
          this.oauth2Info.authDiv = undefined;

          this.oauth2Info.revokeAuthSetting?.setDesc(
            `You've connected as user ${this.settings.onedrive.username}. If you want to disconnect, click this button.`
          );
          this.oauth2Info.revokeAuthSetting = undefined;
          this.oauth2Info.revokeDiv?.toggleClass(
            "onedrive-revoke-auth-button-hide",
            this.settings.onedrive.username === ""
          );
          this.oauth2Info.revokeDiv = undefined;
        } else {
          new Notice(
            "Something went wrong from response from OneDrive. Maybe you rejected the auth?"
          );
          throw Error(
            `do not know how to deal with the callback: ${JSON.stringify(
              inputParams
            )}`
          );
        }
      }
    );

    this.syncRibbon = this.addRibbonIcon(
      iconNameSyncWait,
      `${this.manifest.name}`,
      async () => this.syncRun("manual")
    );

    this.addSettingTab(new RemotelySaveSettingTab(this.app, this));

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   log.info("click", evt);
    // });

    if (
      this.settings.autoRunEveryMilliseconds !== undefined &&
      this.settings.autoRunEveryMilliseconds !== null &&
      this.settings.autoRunEveryMilliseconds > 0
    ) {
      const intervalID = window.setInterval(() => {
        this.syncRun("auto");
      }, this.settings.autoRunEveryMilliseconds);
      this.autoRunIntervalID = intervalID;
      this.registerInterval(intervalID);
    }
  }

  onunload() {
    log.info(`unloading plugin ${this.manifest.id}`);
    this.destroyDBs();
  }

  async loadSettings() {
    this.settings = Object.assign(
      {},
      cloneDeep(DEFAULT_SETTINGS),
      messyConfigToNormal(await this.loadData())
    );
    if (this.settings.dropbox.clientID === "") {
      this.settings.dropbox.clientID = DEFAULT_SETTINGS.dropbox.clientID;
    }
    if (this.settings.onedrive.clientID === "") {
      this.settings.onedrive.clientID = DEFAULT_SETTINGS.onedrive.clientID;
    }
    if (this.settings.onedrive.authority === "") {
      this.settings.onedrive.authority = DEFAULT_SETTINGS.onedrive.authority;
    }
    if (this.settings.webdav.manualRecursive === undefined) {
      this.settings.webdav.manualRecursive = false;
    }
  }

  async saveSettings() {
    await this.saveData(normalConfigToMessy(this.settings));
  }

  async checkIfOauthExpires() {
    let needSave: boolean = false;
    const current = Date.now();

    // fullfill old version settings
    if (
      this.settings.dropbox.refreshToken !== "" &&
      this.settings.dropbox.credentialsShouldBeDeletedAtTime === undefined
    ) {
      // It has a refreshToken, but not expire time.
      // Likely to be a setting from old version.
      // we set it to a month.
      this.settings.dropbox.credentialsShouldBeDeletedAtTime =
        current + 1000 * 60 * 60 * 24 * 30;
      needSave = true;
    }
    if (
      this.settings.onedrive.refreshToken !== "" &&
      this.settings.onedrive.credentialsShouldBeDeletedAtTime === undefined
    ) {
      this.settings.onedrive.credentialsShouldBeDeletedAtTime =
        current + 1000 * 60 * 60 * 24 * 30;
      needSave = true;
    }

    // check expired or not
    let dropboxExpired = false;
    if (
      this.settings.dropbox.refreshToken !== "" &&
      current >= this.settings.dropbox.credentialsShouldBeDeletedAtTime
    ) {
      dropboxExpired = true;
      this.settings.dropbox = cloneDeep(DEFAULT_DROPBOX_CONFIG);
      needSave = true;
    }

    let onedriveExpired = false;
    if (
      this.settings.onedrive.refreshToken !== "" &&
      current >= this.settings.onedrive.credentialsShouldBeDeletedAtTime
    ) {
      onedriveExpired = true;
      this.settings.onedrive = cloneDeep(DEFAULT_ONEDRIVE_CONFIG);
      needSave = true;
    }

    // save back
    if (needSave) {
      await this.saveSettings();
    }

    // send notice
    if (dropboxExpired && onedriveExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth Dropbox and OneDrive for a while, you need to re-auth them again.`,
        6000
      );
    } else if (dropboxExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth Dropbox for a while, you need to re-auth it again.`,
        6000
      );
    } else if (onedriveExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth OneDrive for a while, you need to re-auth it again.`,
        6000
      );
    }
  }

  async checkIfVaultIDAssigned() {
    if (
      this.settings.vaultRandomID === undefined ||
      this.settings.vaultRandomID === ""
    ) {
      this.settings.vaultRandomID = nanoid();
      await this.saveSettings();
    }
  }

  async prepareDB() {
    this.db = await prepareDBs(this.settings.vaultRandomID);
  }

  destroyDBs() {
    /* destroyDBs(this.db); */
  }

  async setCurrSyncMsg(
    i: number,
    totalCount: number,
    pathName: string,
    decision: string
  ) {
    const msg = `syncing progress=${i}/${totalCount},decision=${decision},path=${pathName}`;
    this.currSyncMsg = msg;
  }
}
