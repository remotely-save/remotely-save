// biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
import AggregateError from "aggregate-error";
import cloneDeep from "lodash/cloneDeep";
import throttle from "lodash/throttle";
import { FileText, RefreshCcw, RotateCcw, createElement } from "lucide";
import {
  Events,
  FileSystemAdapter,
  type Modal,
  Notice,
  Platform,
  Plugin,
  type Setting,
  TFolder,
  addIcon,
  requireApiVersion,
  setIcon,
} from "obsidian";
import {
  DEFAULT_PRO_CONFIG,
  getAndSaveProEmail,
  getAndSaveProFeatures,
  sendAuthReq as sendAuthReqPro,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplacePro,
} from "../pro/src/account";
import {
  COMMAND_CALLBACK_BOX,
  COMMAND_CALLBACK_PCLOUD,
  COMMAND_CALLBACK_PRO,
  COMMAND_CALLBACK_YANDEXDISK,
} from "../pro/src/baseTypesPro";
import {
  DEFAULT_BOX_CONFIG,
  FakeFsBox,
  sendAuthReq as sendAuthReqBox,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceBox,
} from "../pro/src/fsBox";
import { DEFAULT_GOOGLEDRIVE_CONFIG } from "../pro/src/fsGoogleDrive";
import {
  type AuthAllowFirstRes as AuthAllowFirstResPCloud,
  DEFAULT_PCLOUD_CONFIG,
  generateAuthUrl as generateAuthUrlPCloud,
  sendAuthReq as sendAuthReqPCloud,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplacePCloud,
} from "../pro/src/fsPCloud";
import {
  DEFAULT_YANDEXDISK_CONFIG,
  sendAuthReq as sendAuthReqYandexDisk,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceYandexDisk,
} from "../pro/src/fsYandexDisk";
import type {
  RemotelySavePluginSettings,
  SyncTriggerSourceType,
} from "./baseTypes";
import {
  COMMAND_CALLBACK,
  COMMAND_CALLBACK_DROPBOX,
  COMMAND_CALLBACK_ONEDRIVE,
  COMMAND_URI,
} from "./baseTypes";
import { API_VER_ENSURE_REQURL_OK } from "./baseTypesObs";
import { messyConfigToNormal, normalConfigToMessy } from "./configPersist";
import { exportVaultSyncPlansToFiles } from "./debugMode";
import {
  DEFAULT_DROPBOX_CONFIG,
  sendAuthReq as sendAuthReqDropbox,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceDropbox,
} from "./fsDropbox";
import { FakeFsEncrypt } from "./fsEncrypt";
import { getClient } from "./fsGetter";
import { FakeFsLocal } from "./fsLocal";
import {
  type AccessCodeResponseSuccessfulType,
  DEFAULT_ONEDRIVE_CONFIG,
  sendAuthReq as sendAuthReqOnedrive,
  setConfigBySuccessfullAuthInplace as setConfigBySuccessfullAuthInplaceOnedrive,
} from "./fsOnedrive";
import { DEFAULT_S3_CONFIG } from "./fsS3";
import { DEFAULT_WEBDAV_CONFIG } from "./fsWebdav";
import { DEFAULT_WEBDIS_CONFIG } from "./fsWebdis";
import { I18n } from "./i18n";
import type { LangTypeAndAuto, TransItemType } from "./i18n";
import { importQrCodeUri } from "./importExport";
import {
  type InternalDBs,
  clearAllLoggerOutputRecords,
  clearExpiredSyncPlanRecords,
  getLastSuccessSyncTimeByVault,
  prepareDBs,
  upsertLastSuccessSyncTimeByVault,
  upsertPluginVersionByVault,
} from "./localdb";
import { changeMobileStatusBar } from "./misc";
import { DEFAULT_PROFILER_CONFIG, type Profiler } from "./profiler";
import { RemotelySaveSettingTab } from "./settings";
import { syncer } from "./sync";
import { SyncAlgoV3Modal } from "./syncAlgoV3Notice";

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  webdav: DEFAULT_WEBDAV_CONFIG,
  dropbox: DEFAULT_DROPBOX_CONFIG,
  onedrive: DEFAULT_ONEDRIVE_CONFIG,
  webdis: DEFAULT_WEBDIS_CONFIG,
  googledrive: DEFAULT_GOOGLEDRIVE_CONFIG,
  box: DEFAULT_BOX_CONFIG,
  pcloud: DEFAULT_PCLOUD_CONFIG,
  yandexdisk: DEFAULT_YANDEXDISK_CONFIG,
  password: "",
  serviceType: "s3",
  currLogLevel: "info",
  // vaultRandomID: "", // deprecated
  autoRunEveryMilliseconds: -1,
  initRunAfterMilliseconds: -1,
  syncOnSaveAfterMilliseconds: -1,
  agreeToUploadExtraMetadata: true, // as of 20240106, it's safe to assume every new user agrees with this
  concurrency: 5,
  syncConfigDir: false,
  syncUnderscoreItems: false,
  lang: "auto",
  logToDB: false,
  skipSizeLargerThan: -1,
  ignorePaths: [],
  enableStatusBarInfo: true,
  deleteToWhere: "system",
  agreeToUseSyncV3: false,
  conflictAction: "keep_newer",
  howToCleanEmptyFolder: "clean_both",
  protectModifyPercentage: 50,
  syncDirection: "bidirectional",
  obfuscateSettingFile: true,
  enableMobileStatusBar: false,
  encryptionMethod: "unknown",
  profiler: DEFAULT_PROFILER_CONFIG,
  pro: DEFAULT_PRO_CONFIG,
};

interface OAuth2Info {
  verifier?: string;
  helperModal?: Modal;
  authDiv?: HTMLElement;
  revokeDiv?: HTMLElement;
  revokeAuthSetting?: Setting;
}

const iconNameSyncWait = `remotely-save-sync-wait`;
const iconNameSyncRunning = `remotely-save-sync-running`;
const iconNameLogs = `remotely-save-logs`;

const getIconSvg = () => {
  const iconSvgSyncWait = createElement(RotateCcw);
  iconSvgSyncWait.setAttribute("width", "100");
  iconSvgSyncWait.setAttribute("height", "100");
  const iconSvgSyncRunning = createElement(RefreshCcw);
  iconSvgSyncRunning.setAttribute("width", "100");
  iconSvgSyncRunning.setAttribute("height", "100");
  const iconSvgLogs = createElement(FileText);
  iconSvgLogs.setAttribute("width", "100");
  iconSvgLogs.setAttribute("height", "100");
  const res = {
    iconSvgSyncWait: iconSvgSyncWait.outerHTML,
    iconSvgSyncRunning: iconSvgSyncRunning.outerHTML,
    iconSvgLogs: iconSvgLogs.outerHTML,
  };

  iconSvgSyncWait.empty();
  iconSvgSyncRunning.empty();
  iconSvgLogs.empty();
  return res;
};

export default class RemotelySavePlugin extends Plugin {
  settings!: RemotelySavePluginSettings;
  db!: InternalDBs;
  isSyncing!: boolean;
  hasPendingSyncOnSave!: boolean;
  statusBarElement!: HTMLSpanElement;
  oauth2Info!: OAuth2Info;
  currLogLevel!: string;
  currSyncMsg?: string;
  syncRibbon?: HTMLElement;
  autoRunIntervalID?: number;
  syncOnSaveIntervalID?: number;
  i18n!: I18n;
  vaultRandomID!: string;
  debugServerTemp?: string;
  syncEvent?: Events;
  appContainerObserver?: MutationObserver;

  async syncRun(triggerSource: SyncTriggerSourceType = "manual") {
    // const profiler = new Profiler(
    //   undefined,
    //   this.settings.profiler?.enablePrinting ?? false,
    //   this.settings.profiler?.recordSize ?? false
    // );
    const profiler: Profiler | undefined = undefined;
    const fsLocal = new FakeFsLocal(
      this.app.vault,
      this.settings.syncConfigDir ?? false,
      this.app.vault.configDir,
      this.manifest.id,
      profiler,
      this.settings.deleteToWhere ?? "system"
    );
    const fsRemote = getClient(
      this.settings,
      this.app.vault.getName(),
      async () => await this.saveSettings()
    );
    const fsEncrypt = new FakeFsEncrypt(
      fsRemote,
      this.settings.password ?? "",
      this.settings.encryptionMethod ?? "rclone-base64"
    );

    const t = (x: TransItemType, vars?: any) => {
      return this.i18n.t(x, vars);
    };

    const profileID = this.getCurrProfileID();

    const getProtectError = (
      protectModifyPercentage: number,
      realModifyDeleteCount: number,
      allFilesCount: number
    ) => {
      const percent = ((100 * realModifyDeleteCount) / allFilesCount).toFixed(
        1
      );
      const res = t("syncrun_abort_protectmodifypercentage", {
        protectModifyPercentage,
        realModifyDeleteCount,
        allFilesCount,
        percent,
      });
      return res;
    };

    const getNotice = (
      s: SyncTriggerSourceType,
      msg: string,
      timeout?: number
    ) => {
      if (s === "manual" || s === "dry") {
        new Notice(msg, timeout);
      }
    };

    const notifyFunc = async (s: SyncTriggerSourceType, step: number) => {
      switch (step) {
        case 0:
          if (s === "dry") {
            if (this.settings.currLogLevel === "info") {
              getNotice(s, t("syncrun_shortstep0"));
            } else {
              getNotice(s, t("syncrun_step0"));
            }
          }

          break;

        case 1:
          if (this.settings.currLogLevel === "info") {
            getNotice(
              s,
              t("syncrun_shortstep1", {
                serviceType: this.settings.serviceType,
              })
            );
          } else {
            getNotice(
              s,
              t("syncrun_step1", {
                serviceType: this.settings.serviceType,
              })
            );
          }
          break;

        case 2:
          if (this.settings.currLogLevel === "info") {
            // pass
          } else {
            getNotice(s, t("syncrun_step2"));
          }
          break;

        case 3:
          if (this.settings.currLogLevel === "info") {
            // pass
          } else {
            getNotice(s, t("syncrun_step3"));
          }
          break;

        case 4:
          if (this.settings.currLogLevel === "info") {
            // pass
          } else {
            getNotice(s, t("syncrun_step4"));
          }
          break;

        case 5:
          if (this.settings.currLogLevel === "info") {
            // pass
          } else {
            getNotice(s, t("syncrun_step5"));
          }
          break;

        case 6:
          if (this.settings.currLogLevel === "info") {
            // pass
          } else {
            getNotice(s, t("syncrun_step6"));
          }
          break;

        case 7:
          if (s === "dry") {
            if (this.settings.currLogLevel === "info") {
              getNotice(s, t("syncrun_shortstep2skip"));
            } else {
              getNotice(s, t("syncrun_step7skip"));
            }
          } else {
            if (this.settings.currLogLevel === "info") {
              // pass
            } else {
              getNotice(s, t("syncrun_step7"));
            }
          }
          break;

        case 8:
          if (this.settings.currLogLevel === "info") {
            getNotice(s, t("syncrun_shortstep2"));
          } else {
            getNotice(s, t("syncrun_step8"));
          }
          break;

        default:
          throw Error(`unknown step=${step} for showing notice`);
      }
    };

    const errNotifyFunc = async (s: SyncTriggerSourceType, error: Error) => {
      console.error(error);
      if (error instanceof AggregateError) {
        for (const e of error.errors) {
          getNotice(s, e.message, 10 * 1000);
        }
      } else {
        getNotice(s, error?.message ?? "error while sync", 10 * 1000);
      }
    };

    const ribboonFunc = async (s: SyncTriggerSourceType, step: number) => {
      if (step === 1) {
        if (this.syncRibbon !== undefined) {
          setIcon(this.syncRibbon, iconNameSyncRunning);
          this.syncRibbon.setAttribute(
            "aria-label",
            t("syncrun_syncingribbon", {
              pluginName: this.manifest.name,
              triggerSource: s,
            })
          );
        }
      } else if (step === 8) {
        // last step
        if (this.syncRibbon !== undefined) {
          setIcon(this.syncRibbon, iconNameSyncWait);
          const originLabel = `${this.manifest.name}`;
          this.syncRibbon.setAttribute("aria-label", originLabel);
        }
      }
    };

    const statusBarFunc = async (
      s: SyncTriggerSourceType,
      step: number,
      everythingOk: boolean
    ) => {
      if (step === 1) {
        // change status to "syncing..." on statusbar
        this.updateLastSuccessSyncMsg(-1);
      } else if (step === 8 && everythingOk) {
        const lastSuccessSyncMillis = Date.now();
        await upsertLastSuccessSyncTimeByVault(
          this.db,
          this.vaultRandomID,
          lastSuccessSyncMillis
        );
        this.updateLastSuccessSyncMsg(lastSuccessSyncMillis);
      } else if (!everythingOk) {
        this.updateLastSuccessSyncMsg(-2); // magic number
      }
    };

    const markIsSyncingFunc = async (isSyncing: boolean) => {
      this.isSyncing = isSyncing;
    };

    const callbackSyncProcess = async (
      realCounter: number,
      realTotalCount: number,
      pathName: string,
      decision: string
    ) => {
      this.setCurrSyncMsg(
        realCounter,
        realTotalCount,
        pathName,
        decision,
        triggerSource
      );
    };

    if (this.isSyncing) {
      getNotice(
        triggerSource,
        t("syncrun_alreadyrunning", {
          pluginName: this.manifest.name,
          syncStatus: "running",
          newTriggerSource: triggerSource,
        })
      );

      if (this.currSyncMsg !== undefined && this.currSyncMsg !== "") {
        getNotice(triggerSource, this.currSyncMsg);
      }
      return;
    }

    const configSaver = async () => await this.saveSettings();

    await syncer(
      fsLocal,
      fsRemote,
      fsEncrypt,
      profiler,
      this.db,
      triggerSource,
      profileID,
      this.vaultRandomID,
      this.app.vault.configDir,
      this.settings,
      this.manifest.version,
      configSaver,
      getProtectError,
      markIsSyncingFunc,
      notifyFunc,
      errNotifyFunc,
      ribboonFunc,
      statusBarFunc,
      callbackSyncProcess
    );

    fsEncrypt.closeResources();
    (profiler as Profiler | undefined)?.clear();

    this.syncEvent?.trigger("SYNC_DONE");
  }

  async onload() {
    console.info(`loading plugin ${this.manifest.id}`);

    const { iconSvgSyncWait, iconSvgSyncRunning, iconSvgLogs } = getIconSvg();

    addIcon(iconNameSyncWait, iconSvgSyncWait);
    addIcon(iconNameSyncRunning, iconSvgSyncRunning);
    addIcon(iconNameLogs, iconSvgLogs);

    this.oauth2Info = {
      verifier: "",
      helperModal: undefined,
      authDiv: undefined,
      revokeDiv: undefined,
      revokeAuthSetting: undefined,
    }; // init

    this.currSyncMsg = "";
    this.isSyncing = false;
    this.hasPendingSyncOnSave = false;

    this.syncEvent = new Events();

    await this.loadSettings();

    // MUST after loadSettings and before prepareDB
    const profileID: string = this.getCurrProfileID();

    // lang should be load early, but after settings
    this.i18n = new I18n(this.settings.lang!, async (lang: LangTypeAndAuto) => {
      this.settings.lang = lang;
      await this.saveSettings();
    });
    const t = (x: TransItemType, vars?: any) => {
      return this.i18n.t(x, vars);
    };

    await this.checkIfOauthExpires();

    // MUST before prepareDB()
    // And, it's also possible to be an empty string,
    // which means the vaultRandomID is read from db later!
    const vaultRandomIDFromOldConfigFile =
      await this.getVaultRandomIDFromOldConfigFile();

    // no need to await this
    this.tryToAddIgnoreFile();

    const vaultBasePath = this.getVaultBasePath();

    try {
      await this.prepareDBAndVaultRandomID(
        vaultBasePath,
        vaultRandomIDFromOldConfigFile,
        profileID
      );
    } catch (err: any) {
      new Notice(
        err?.message ?? "error of prepareDBAndVaultRandomID",
        10 * 1000
      );
      throw err;
    }

    // must AFTER preparing DB
    this.enableAutoClearOutputToDBHistIfSet();

    // must AFTER preparing DB
    this.enableAutoClearSyncPlanHist();

    this.registerObsidianProtocolHandler(COMMAND_URI, async (inputParams) => {
      // console.debug(inputParams);
      const parsed = importQrCodeUri(inputParams, this.app.vault.getName());
      if (parsed.status === "error") {
        new Notice(parsed.message);
      } else {
        const copied = cloneDeep(parsed.result);
        // new Notice(JSON.stringify(copied))
        this.settings = Object.assign({}, this.settings, copied);
        this.saveSettings();
        new Notice(
          t("protocol_saveqr", {
            manifestName: this.manifest.name,
          })
        );
      }
    });

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK,
      async (inputParams) => {
        new Notice(
          t("protocol_callbacknotsupported", {
            params: JSON.stringify(inputParams),
          })
        );
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_DROPBOX,
      async (inputParams) => {
        if (
          inputParams.code !== undefined &&
          this.oauth2Info?.verifier !== undefined
        ) {
          if (this.oauth2Info.helperModal !== undefined) {
            const k = this.oauth2Info.helperModal.contentEl;
            k.empty();

            t("protocol_dropbox_connecting")
              .split("\n")
              .forEach((val) => {
                k.createEl("p", {
                  text: val,
                });
              });
          } else {
            new Notice(t("protocol_dropbox_no_modal"));
            return;
          }

          const authRes = await sendAuthReqDropbox(
            this.settings.dropbox.clientID,
            this.oauth2Info.verifier,
            inputParams.code,
            async (e: any) => {
              new Notice(t("protocol_dropbox_connect_fail"));
              new Notice(`${e}`);
              throw e;
            }
          );

          const self = this;
          setConfigBySuccessfullAuthInplaceDropbox(
            this.settings.dropbox,
            authRes!,
            () => self.saveSettings()
          );

          const client = getClient(
            this.settings,
            this.app.vault.getName(),
            () => self.saveSettings()
          );
          const username = await client.getUserDisplayName();
          this.settings.dropbox.username = username;
          await this.saveSettings();

          new Notice(
            t("protocol_dropbox_connect_succ", {
              username: username,
            })
          );

          this.oauth2Info.verifier = ""; // reset it
          this.oauth2Info.helperModal?.close(); // close it
          this.oauth2Info.helperModal = undefined;

          this.oauth2Info.authDiv?.toggleClass(
            "dropbox-auth-button-hide",
            this.settings.dropbox.username !== ""
          );
          this.oauth2Info.authDiv = undefined;

          this.oauth2Info.revokeAuthSetting?.setDesc(
            t("protocol_dropbox_connect_succ_revoke", {
              username: this.settings.dropbox.username,
            })
          );
          this.oauth2Info.revokeAuthSetting = undefined;
          this.oauth2Info.revokeDiv?.toggleClass(
            "dropbox-revoke-auth-button-hide",
            this.settings.dropbox.username === ""
          );
          this.oauth2Info.revokeDiv = undefined;
        } else {
          new Notice(t("protocol_dropbox_connect_fail"));
          throw Error(
            t("protocol_dropbox_connect_unknown", {
              params: JSON.stringify(inputParams),
            })
          );
        }
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_ONEDRIVE,
      async (inputParams) => {
        if (
          inputParams.code !== undefined &&
          this.oauth2Info?.verifier !== undefined
        ) {
          if (this.oauth2Info.helperModal !== undefined) {
            const k = this.oauth2Info.helperModal.contentEl;
            k.empty();

            t("protocol_onedrive_connecting")
              .split("\n")
              .forEach((val) => {
                k.createEl("p", {
                  text: val,
                });
              });
          }

          const rsp = await sendAuthReqOnedrive(
            this.settings.onedrive.clientID,
            this.settings.onedrive.authority,
            inputParams.code,
            this.oauth2Info.verifier,
            async (e: any) => {
              new Notice(t("protocol_onedrive_connect_fail"));
              new Notice(`${e}`);
              return; // throw?
            }
          );

          if ((rsp as any).error !== undefined) {
            new Notice(`${JSON.stringify(rsp)}`);
            throw Error(`${JSON.stringify(rsp)}`);
          }

          const self = this;
          setConfigBySuccessfullAuthInplaceOnedrive(
            this.settings.onedrive,
            rsp as AccessCodeResponseSuccessfulType,
            () => self.saveSettings()
          );

          const client = getClient(
            this.settings,
            this.app.vault.getName(),
            () => self.saveSettings()
          );
          this.settings.onedrive.username = await client.getUserDisplayName();
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
            t("protocol_onedrive_connect_succ_revoke", {
              username: this.settings.onedrive.username,
            })
          );
          this.oauth2Info.revokeAuthSetting = undefined;
          this.oauth2Info.revokeDiv?.toggleClass(
            "onedrive-revoke-auth-button-hide",
            this.settings.onedrive.username === ""
          );
          this.oauth2Info.revokeDiv = undefined;
        } else {
          new Notice(t("protocol_onedrive_connect_fail"));
          throw Error(
            t("protocol_onedrive_connect_unknown", {
              params: JSON.stringify(inputParams),
            })
          );
        }
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_PRO,
      async (inputParams) => {
        if (this.oauth2Info.helperModal !== undefined) {
          const k = this.oauth2Info.helperModal.contentEl;
          k.empty();

          t("protocol_pro_connecting")
            .split("\n")
            .forEach((val) => {
              k.createEl("p", {
                text: val,
              });
            });
        }

        console.debug(inputParams);
        const authRes = await sendAuthReqPro(
          this.oauth2Info.verifier || "verifier",
          inputParams.code,
          async (e: any) => {
            new Notice(t("protocol_pro_connect_fail"));
            new Notice(`${e}`);
            throw e;
          }
        );
        console.debug(authRes);

        const self = this;
        await setConfigBySuccessfullAuthInplacePro(
          this.settings.pro!,
          authRes,
          () => self.saveSettings()
        );

        await getAndSaveProFeatures(
          this.settings.pro!,
          this.manifest.version,
          () => self.saveSettings()
        );

        await getAndSaveProEmail(
          this.settings.pro!,
          this.manifest.version,
          () => self.saveSettings()
        );

        this.oauth2Info.verifier = ""; // reset it
        this.oauth2Info.helperModal?.close(); // close it
        this.oauth2Info.helperModal = undefined;

        this.oauth2Info.authDiv?.toggleClass(
          "pro-auth-button-hide",
          this.settings.pro?.refreshToken !== ""
        );
        this.oauth2Info.authDiv = undefined;

        this.oauth2Info.revokeAuthSetting?.setDesc(
          t("protocol_pro_connect_succ_revoke", {
            email: this.settings.pro?.email,
          })
        );
        this.oauth2Info.revokeAuthSetting = undefined;
        this.oauth2Info.revokeDiv?.toggleClass(
          "pro-revoke-auth-button-hide",
          this.settings.pro?.email === ""
        );
        this.oauth2Info.revokeDiv = undefined;
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_BOX,
      async (inputParams) => {
        if (this.oauth2Info.helperModal !== undefined) {
          const k = this.oauth2Info.helperModal.contentEl;
          k.empty();

          t("protocol_box_connecting")
            .split("\n")
            .forEach((val) => {
              k.createEl("p", {
                text: val,
              });
            });
        }

        console.debug(inputParams);
        const authRes = await sendAuthReqBox(
          inputParams.code,
          async (e: any) => {
            new Notice(t("protocol_box_connect_fail"));
            new Notice(`${e}`);
            throw e;
          }
        );
        console.debug(authRes);

        const self = this;
        await setConfigBySuccessfullAuthInplaceBox(
          this.settings.box!,
          authRes,
          () => self.saveSettings()
        );

        this.oauth2Info.verifier = ""; // reset it
        this.oauth2Info.helperModal?.close(); // close it
        this.oauth2Info.helperModal = undefined;

        this.oauth2Info.authDiv?.toggleClass(
          "box-auth-button-hide",
          this.settings.box?.refreshToken !== ""
        );
        this.oauth2Info.authDiv = undefined;

        this.oauth2Info.revokeAuthSetting?.setDesc(
          t("protocol_box_connect_succ_revoke")
        );
        this.oauth2Info.revokeAuthSetting = undefined;
        this.oauth2Info.revokeDiv?.toggleClass(
          "box-revoke-auth-button-hide",
          this.settings.box?.refreshToken === ""
        );
        this.oauth2Info.revokeDiv = undefined;
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_PCLOUD,
      async (inputParams) => {
        if (this.oauth2Info.helperModal !== undefined) {
          const k = this.oauth2Info.helperModal.contentEl;
          k.empty();

          t("protocol_pcloud_connecting")
            .split("\n")
            .forEach((val) => {
              k.createEl("p", {
                text: val,
              });
            });
        }

        console.debug(inputParams);
        const authRes = await sendAuthReqPCloud(
          inputParams.hostname,
          inputParams.code,
          async (e: any) => {
            new Notice(t("protocol_pcloud_connect_fail"));
            new Notice(`${e}`);
            throw e;
          }
        );
        console.debug(authRes);

        const self = this;
        await setConfigBySuccessfullAuthInplacePCloud(
          this.settings.pcloud!,
          inputParams as unknown as AuthAllowFirstResPCloud,
          authRes,
          () => self.saveSettings()
        );

        this.oauth2Info.verifier = ""; // reset it
        this.oauth2Info.helperModal?.close(); // close it
        this.oauth2Info.helperModal = undefined;

        this.oauth2Info.authDiv?.toggleClass(
          "pcloud-auth-button-hide",
          this.settings.pcloud?.accessToken !== ""
        );
        this.oauth2Info.authDiv = undefined;

        this.oauth2Info.revokeAuthSetting?.setDesc(
          t("protocol_pcloud_connect_succ_revoke")
        );
        this.oauth2Info.revokeAuthSetting = undefined;
        this.oauth2Info.revokeDiv?.toggleClass(
          "pcloud-revoke-auth-button-hide",
          this.settings.pcloud?.accessToken === ""
        );
        this.oauth2Info.revokeDiv = undefined;
      }
    );

    this.registerObsidianProtocolHandler(
      COMMAND_CALLBACK_YANDEXDISK,
      async (inputParams) => {
        if (this.oauth2Info.helperModal !== undefined) {
          const k = this.oauth2Info.helperModal.contentEl;
          k.empty();

          t("protocol_yandexdisk_connecting")
            .split("\n")
            .forEach((val) => {
              k.createEl("p", {
                text: val,
              });
            });
        }

        console.debug(inputParams);
        const authRes = await sendAuthReqYandexDisk(
          inputParams.code,
          async (e: any) => {
            new Notice(t("protocol_yandexdisk_connect_fail"));
            new Notice(`${e}`);
            throw e;
          }
        );
        console.debug(authRes);

        const self = this;
        await setConfigBySuccessfullAuthInplaceYandexDisk(
          this.settings.yandexdisk!,
          authRes,
          () => self.saveSettings()
        );

        this.oauth2Info.verifier = ""; // reset it
        this.oauth2Info.helperModal?.close(); // close it
        this.oauth2Info.helperModal = undefined;

        this.oauth2Info.authDiv?.toggleClass(
          "yandexdisk-auth-button-hide",
          this.settings.yandexdisk?.refreshToken !== ""
        );
        this.oauth2Info.authDiv = undefined;

        this.oauth2Info.revokeAuthSetting?.setDesc(
          t("protocol_yandexdisk_connect_succ_revoke")
        );
        this.oauth2Info.revokeAuthSetting = undefined;
        this.oauth2Info.revokeDiv?.toggleClass(
          "yandexdisk-revoke-auth-button-hide",
          this.settings.yandexdisk?.refreshToken === ""
        );
        this.oauth2Info.revokeDiv = undefined;
      }
    );

    this.syncRibbon = this.addRibbonIcon(
      iconNameSyncWait,
      `${this.manifest.name}`,
      async () => this.syncRun("manual")
    );

    this.enableMobileStatusBarIfSet();

    // Create Status Bar Item
    if (
      (!Platform.isMobile ||
        (Platform.isMobile && this.settings.enableMobileStatusBar)) &&
      this.settings.enableStatusBarInfo === true
    ) {
      const statusBarItem = this.addStatusBarItem();
      this.statusBarElement = statusBarItem.createEl("span");
      this.statusBarElement.setAttribute("data-tooltip-position", "top");

      this.updateLastSuccessSyncMsg(
        await getLastSuccessSyncTimeByVault(this.db, this.vaultRandomID)
      );
      // update statusbar text every 30 seconds
      this.registerInterval(
        window.setInterval(async () => {
          this.updateLastSuccessSyncMsg(
            await getLastSuccessSyncTimeByVault(this.db, this.vaultRandomID)
          );
        }, 1000 * 30)
      );
    }

    this.addCommand({
      id: "start-sync",
      name: t("command_startsync"),
      icon: iconNameSyncWait,
      callback: async () => {
        this.syncRun("manual");
      },
    });

    this.addCommand({
      id: "start-sync-dry-run",
      name: t("command_drynrun"),
      icon: iconNameSyncWait,
      callback: async () => {
        this.syncRun("dry");
      },
    });

    this.addCommand({
      id: "export-sync-plans-1-only-change",
      name: t("command_exportsyncplans_1_only_change"),
      icon: iconNameLogs,
      callback: async () => {
        await exportVaultSyncPlansToFiles(
          this.db,
          this.app.vault,
          this.vaultRandomID,
          1,
          true
        );
        new Notice(t("settings_syncplans_notice"));
      },
    });

    this.addCommand({
      id: "export-sync-plans-1",
      name: t("command_exportsyncplans_1"),
      icon: iconNameLogs,
      callback: async () => {
        await exportVaultSyncPlansToFiles(
          this.db,
          this.app.vault,
          this.vaultRandomID,
          1,
          false
        );
        new Notice(t("settings_syncplans_notice"));
      },
    });

    this.addCommand({
      id: "export-sync-plans-5",
      name: t("command_exportsyncplans_5"),
      icon: iconNameLogs,
      callback: async () => {
        await exportVaultSyncPlansToFiles(
          this.db,
          this.app.vault,
          this.vaultRandomID,
          5,
          false
        );
        new Notice(t("settings_syncplans_notice"));
      },
    });

    this.addCommand({
      id: "export-sync-plans-all",
      name: t("command_exportsyncplans_all"),
      icon: iconNameLogs,
      callback: async () => {
        await exportVaultSyncPlansToFiles(
          this.db,
          this.app.vault,
          this.vaultRandomID,
          -1,
          false
        );
        new Notice(t("settings_syncplans_notice"));
      },
    });

    this.addSettingTab(new RemotelySaveSettingTab(this.app, this));

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   console.info("click", evt);
    // });

    this.enableCheckingFileStat();

    if (!this.settings.agreeToUseSyncV3) {
      const syncAlgoV3Modal = new SyncAlgoV3Modal(this.app, this);
      syncAlgoV3Modal.open();
    } else {
      this.enableAutoSyncIfSet();
      this.enableInitSyncIfSet();
      this.toggleSyncOnSaveIfSet();
    }

    // compare versions and read new versions
    const { oldVersion } = await upsertPluginVersionByVault(
      this.db,
      this.vaultRandomID,
      this.manifest.version
    );
  }

  async onunload() {
    console.info(`unloading plugin ${this.manifest.id}`);
    this.syncRibbon = undefined;
    if (this.appContainerObserver !== undefined) {
      this.appContainerObserver.disconnect();
      this.appContainerObserver = undefined;
    }
    if (this.oauth2Info !== undefined) {
      this.oauth2Info.helperModal = undefined;
      this.oauth2Info = {
        verifier: "",
        helperModal: undefined,
        authDiv: undefined,
        revokeDiv: undefined,
        revokeAuthSetting: undefined,
      };
    }
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
    if (this.settings.dropbox.remoteBaseDir === undefined) {
      this.settings.dropbox.remoteBaseDir = "";
    }
    if (this.settings.onedrive.clientID === "") {
      this.settings.onedrive.clientID = DEFAULT_SETTINGS.onedrive.clientID;
    }
    if (this.settings.onedrive.authority === "") {
      this.settings.onedrive.authority = DEFAULT_SETTINGS.onedrive.authority;
    }
    if (this.settings.onedrive.remoteBaseDir === undefined) {
      this.settings.onedrive.remoteBaseDir = "";
    }
    if (this.settings.onedrive.emptyFile === undefined) {
      this.settings.onedrive.emptyFile = "skip";
    }
    if (this.settings.webdav.manualRecursive === undefined) {
      this.settings.webdav.manualRecursive = true;
    }
    if (
      this.settings.webdav.depth === undefined ||
      this.settings.webdav.depth === "auto" ||
      this.settings.webdav.depth === "auto_1" ||
      this.settings.webdav.depth === "auto_infinity" ||
      this.settings.webdav.depth === "auto_unknown"
    ) {
      // auto is deprecated as of 20240116
      this.settings.webdav.depth = "manual_1";
      this.settings.webdav.manualRecursive = true;
    }
    if (this.settings.webdav.remoteBaseDir === undefined) {
      this.settings.webdav.remoteBaseDir = "";
    }
    if (this.settings.s3.partsConcurrency === undefined) {
      this.settings.s3.partsConcurrency = 20;
    }
    if (this.settings.s3.forcePathStyle === undefined) {
      this.settings.s3.forcePathStyle = false;
    }
    if (this.settings.s3.remotePrefix === undefined) {
      this.settings.s3.remotePrefix = "";
    }
    if (this.settings.s3.useAccurateMTime === undefined) {
      // it causes money, so disable it by default
      this.settings.s3.useAccurateMTime = false;
    }
    if (this.settings.s3.generateFolderObject === undefined) {
      this.settings.s3.generateFolderObject = false;
    }
    if (this.settings.ignorePaths === undefined) {
      this.settings.ignorePaths = [];
    }
    if (this.settings.enableStatusBarInfo === undefined) {
      this.settings.enableStatusBarInfo = true;
    }
    if (this.settings.syncOnSaveAfterMilliseconds === undefined) {
      this.settings.syncOnSaveAfterMilliseconds = -1;
    }
    if (this.settings.deleteToWhere === undefined) {
      this.settings.deleteToWhere = "system";
    }
    this.settings.logToDB = false; // deprecated as of 20240113

    if (requireApiVersion(API_VER_ENSURE_REQURL_OK)) {
      this.settings.s3.bypassCorsLocally = true; // deprecated as of 20240113
    }

    if (this.settings.agreeToUseSyncV3 === undefined) {
      this.settings.agreeToUseSyncV3 = false;
    }
    if (this.settings.conflictAction === undefined) {
      this.settings.conflictAction = "keep_newer";
    }
    if (this.settings.howToCleanEmptyFolder === undefined) {
      this.settings.howToCleanEmptyFolder = "clean_both";
    }
    if (this.settings.protectModifyPercentage === undefined) {
      this.settings.protectModifyPercentage = 50;
    }
    if (this.settings.syncDirection === undefined) {
      this.settings.syncDirection = "bidirectional";
    }

    if (this.settings.obfuscateSettingFile === undefined) {
      this.settings.obfuscateSettingFile = true;
    }

    if (this.settings.enableMobileStatusBar === undefined) {
      this.settings.enableMobileStatusBar = false;
    }

    if (
      this.settings.encryptionMethod === undefined ||
      this.settings.encryptionMethod === "unknown"
    ) {
      if (
        this.settings.password === undefined ||
        this.settings.password === ""
      ) {
        // we have a preferred way
        this.settings.encryptionMethod = "rclone-base64";
      } else {
        // likely to be inherited from the old version
        this.settings.encryptionMethod = "openssl-base64";
      }
    }

    if (this.settings.profiler === undefined) {
      this.settings.profiler = DEFAULT_PROFILER_CONFIG;
    }
    if (this.settings.profiler.enablePrinting === undefined) {
      this.settings.profiler.enablePrinting = false;
    }
    if (this.settings.profiler.recordSize === undefined) {
      this.settings.profiler.recordSize = false;
    }

    if (this.settings.googledrive === undefined) {
      this.settings.googledrive = DEFAULT_GOOGLEDRIVE_CONFIG;
    }

    if (this.settings.box === undefined) {
      this.settings.box = DEFAULT_BOX_CONFIG;
    }

    if (this.settings.pcloud === undefined) {
      this.settings.pcloud = DEFAULT_PCLOUD_CONFIG;
    }

    if (this.settings.yandexdisk === undefined) {
      this.settings.yandexdisk = DEFAULT_YANDEXDISK_CONFIG;
    }

    await this.saveSettings();
  }

  async saveSettings() {
    if (this.settings.obfuscateSettingFile) {
      await this.saveData(normalConfigToMessy(this.settings));
    } else {
      await this.saveData(this.settings);
    }
  }

  /**
   * After 202403 the data should be of profile based.
   */
  getCurrProfileID() {
    if (this.settings.serviceType !== undefined) {
      return `${this.settings.serviceType}-default-1`;
    } else {
      throw Error("unknown serviceType in the setting!");
    }
  }

  async checkIfOauthExpires() {
    let needSave = false;
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
      current >= this.settings!.dropbox!.credentialsShouldBeDeletedAtTime!
    ) {
      dropboxExpired = true;
      this.settings.dropbox = cloneDeep(DEFAULT_DROPBOX_CONFIG);
      needSave = true;
    }

    let onedriveExpired = false;
    if (
      this.settings.onedrive.refreshToken !== "" &&
      current >= this.settings!.onedrive!.credentialsShouldBeDeletedAtTime!
    ) {
      onedriveExpired = true;
      this.settings.onedrive = cloneDeep(DEFAULT_ONEDRIVE_CONFIG);
      needSave = true;
    }

    let googleDriveExpired = false;
    if (
      this.settings.googledrive.refreshToken !== "" &&
      current >= this.settings!.googledrive!.credentialsShouldBeDeletedAtTimeMs!
    ) {
      googleDriveExpired = true;
      this.settings.googledrive = cloneDeep(DEFAULT_GOOGLEDRIVE_CONFIG);
      needSave = true;
    }

    let boxExpired = false;
    if (
      this.settings.box.refreshToken !== "" &&
      current >= this.settings!.box!.credentialsShouldBeDeletedAtTimeMs!
    ) {
      boxExpired = true;
      this.settings.box = cloneDeep(DEFAULT_BOX_CONFIG);
      needSave = true;
    }

    let pCloudExpired = false;
    if (
      this.settings.pcloud.accessToken !== "" &&
      current >= this.settings!.pcloud!.credentialsShouldBeDeletedAtTimeMs!
    ) {
      pCloudExpired = true;
      this.settings.pcloud = cloneDeep(DEFAULT_PCLOUD_CONFIG);
      needSave = true;
    }

    let yandexDiskExpired = false;
    if (
      this.settings.yandexdisk.refreshToken !== "" &&
      current >= this.settings!.yandexdisk!.credentialsShouldBeDeletedAtTimeMs!
    ) {
      yandexDiskExpired = true;
      this.settings.yandexdisk = cloneDeep(DEFAULT_YANDEXDISK_CONFIG);
      needSave = true;
    }

    if (this.settings.pro === undefined) {
      this.settings.pro = cloneDeep(DEFAULT_PRO_CONFIG);
    }

    // save back
    if (needSave) {
      await this.saveSettings();
    }

    // send notice
    if (dropboxExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth Dropbox for many days, you need to re-auth it again.`,
        6000
      );
    }
    if (onedriveExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth OneDrive for many days, you need to re-auth it again.`,
        6000
      );
    }
    if (googleDriveExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth Google Drive for many days, you need to re-auth it again.`,
        6000
      );
    }
    if (boxExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth Box for many days, you need to re-auth it again.`,
        6000
      );
    }
    if (pCloudExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth pCloud for many days, you need to re-auth it again.`,
        6000
      );
    }
    if (yandexDiskExpired) {
      new Notice(
        `${this.manifest.name}: You haven't manually auth Yandex Disk for many days, you need to re-auth it again.`,
        6000
      );
    }
  }

  async getVaultRandomIDFromOldConfigFile() {
    let vaultRandomID = "";
    if (this.settings.vaultRandomID !== undefined) {
      // In old version, the vault id is saved in data.json
      // But we want to store it in localForage later
      if (this.settings.vaultRandomID !== "") {
        // a real string was assigned before
        vaultRandomID = this.settings.vaultRandomID;
      }
      console.debug("vaultRandomID is no longer saved in data.json");
      delete this.settings.vaultRandomID;
      await this.saveSettings();
    }
    return vaultRandomID;
  }

  async trash(x: string) {
    if (this.settings.deleteToWhere === "obsidian") {
      await this.app.vault.adapter.trashLocal(x);
    } else {
      // "system"
      if (!(await this.app.vault.adapter.trashSystem(x))) {
        await this.app.vault.adapter.trashLocal(x);
      }
    }
  }

  getVaultBasePath() {
    if (this.app.vault.adapter instanceof FileSystemAdapter) {
      // in desktop
      return this.app.vault.adapter.getBasePath().split("?")[0];
    } else {
      // in mobile
      return this.app.vault.adapter.getResourcePath("").split("?")[0];
    }
  }

  async prepareDBAndVaultRandomID(
    vaultBasePath: string,
    vaultRandomIDFromOldConfigFile: string,
    profileID: string
  ) {
    const { db, vaultRandomID } = await prepareDBs(
      vaultBasePath,
      vaultRandomIDFromOldConfigFile,
      profileID
    );
    this.db = db;
    this.vaultRandomID = vaultRandomID;
  }

  enableAutoSyncIfSet() {
    if (
      this.settings.autoRunEveryMilliseconds !== undefined &&
      this.settings.autoRunEveryMilliseconds !== null &&
      this.settings.autoRunEveryMilliseconds > 0
    ) {
      this.app.workspace.onLayoutReady(() => {
        const intervalID = window.setInterval(() => {
          this.syncRun("auto");
        }, this.settings.autoRunEveryMilliseconds);
        this.autoRunIntervalID = intervalID;
        this.registerInterval(intervalID);
      });
    }
  }

  enableInitSyncIfSet() {
    if (
      this.settings.initRunAfterMilliseconds !== undefined &&
      this.settings.initRunAfterMilliseconds !== null &&
      this.settings.initRunAfterMilliseconds > 0
    ) {
      this.app.workspace.onLayoutReady(() => {
        window.setTimeout(() => {
          this.syncRun("auto_once_init");
        }, this.settings.initRunAfterMilliseconds);
      });
    }
  }

  async _checkCurrFileModified(caller: "SYNC" | "FILE_CHANGES") {
    console.debug(`inside checkCurrFileModified`);
    const currentFile = this.app.workspace.getActiveFile();

    if (currentFile) {
      console.debug(`we have currentFile=${currentFile.path}`);
      // get the last modified time of the current file
      // if it has modified after lastSuccessSync
      // then schedule a run for syncOnSaveAfterMilliseconds after it was modified
      const lastModified = currentFile.stat.mtime;
      const lastSuccessSyncMillis = await getLastSuccessSyncTimeByVault(
        this.db,
        this.vaultRandomID
      );

      console.debug(
        `lastModified=${lastModified}, lastSuccessSyncMillis=${lastSuccessSyncMillis}`
      );

      if (
        caller === "SYNC" ||
        (caller === "FILE_CHANGES" && lastModified > lastSuccessSyncMillis)
      ) {
        console.debug(
          `so lastModified > lastSuccessSyncMillis or it's called while syncing before`
        );
        console.debug(
          `caller=${caller}, isSyncing=${this.isSyncing}, hasPendingSyncOnSave=${this.hasPendingSyncOnSave}`
        );
        if (this.isSyncing) {
          this.hasPendingSyncOnSave = true;
          // wait for next event
          return;
        } else {
          if (this.hasPendingSyncOnSave || caller === "FILE_CHANGES") {
            this.hasPendingSyncOnSave = false;
            await this.syncRun("auto_sync_on_save");
          }
          return;
        }
      }
    } else {
      console.debug(`no currentFile here`);
    }
  }

  _syncOnSaveEvent1 = () => {
    this._checkCurrFileModified("SYNC");
  };

  _syncOnSaveEvent2 = throttle(
    async () => {
      await this._checkCurrFileModified("FILE_CHANGES");
    },
    1000 * 3,
    {
      leading: false,
      trailing: true,
    }
  );

  toggleSyncOnSaveIfSet() {
    if (
      this.settings.syncOnSaveAfterMilliseconds !== undefined &&
      this.settings.syncOnSaveAfterMilliseconds !== null &&
      this.settings.syncOnSaveAfterMilliseconds > 0
    ) {
      this.app.workspace.onLayoutReady(() => {
        // listen to sync done
        this.registerEvent(
          this.syncEvent?.on("SYNC_DONE", this._syncOnSaveEvent1)!
        );

        // listen to current file save changes
        this.registerEvent(this.app.vault.on("modify", this._syncOnSaveEvent2));
        this.registerEvent(this.app.vault.on("create", this._syncOnSaveEvent2));
        this.registerEvent(this.app.vault.on("delete", this._syncOnSaveEvent2));
      });
    } else {
      this.syncEvent?.off("SYNC_DONE", this._syncOnSaveEvent1);
      this.app.vault.off("modify", this._syncOnSaveEvent2);
      this.app.vault.off("create", this._syncOnSaveEvent2);
      this.app.vault.off("delete", this._syncOnSaveEvent2);
    }
  }

  enableMobileStatusBarIfSet() {
    this.app.workspace.onLayoutReady(() => {
      if (Platform.isMobile && this.settings.enableMobileStatusBar) {
        this.appContainerObserver = changeMobileStatusBar("enable");
      }
    });
  }

  enableCheckingFileStat() {
    this.app.workspace.onLayoutReady(() => {
      const t = (x: TransItemType, vars?: any) => {
        return this.i18n.t(x, vars);
      };
      this.registerEvent(
        this.app.workspace.on("file-menu", (menu, file) => {
          if (file instanceof TFolder) {
            // folder not supported yet
            return;
          }

          menu.addItem((item) => {
            item
              .setTitle(t("menu_check_file_stat"))
              .setIcon("file-cog")
              .onClick(async () => {
                const filePath = file.path;
                const fsLocal = new FakeFsLocal(
                  this.app.vault,
                  this.settings.syncConfigDir ?? false,
                  this.app.vault.configDir,
                  this.manifest.id,
                  undefined,
                  this.settings.deleteToWhere ?? "system"
                );
                const s = await fsLocal.stat(filePath);
                new Notice(JSON.stringify(s, null, 2), 10000);
              });
          });
        })
      );
    });
  }

  async saveAgreeToUseNewSyncAlgorithm() {
    this.settings.agreeToUseSyncV3 = true;
    await this.saveSettings();
  }

  setCurrSyncMsg(
    i: number,
    totalCount: number,
    pathName: string,
    decision: string,
    triggerSource: SyncTriggerSourceType
  ) {
    const msg = `syncing progress=${i}/${totalCount},decision=${decision},path=${pathName},source=${triggerSource}`;
    this.currSyncMsg = msg;
  }

  updateLastSuccessSyncMsg(lastSuccessSyncMillis?: number) {
    if (this.statusBarElement === undefined) return;

    const t = (x: TransItemType, vars?: any) => {
      return this.i18n.t(x, vars);
    };

    let lastSyncMsg = t("statusbar_lastsync_never");
    let lastSyncLabelMsg = t("statusbar_lastsync_never_label");

    if (lastSuccessSyncMillis !== undefined && lastSuccessSyncMillis === -1) {
      lastSyncMsg = t("statusbar_syncing");
    }

    if (lastSuccessSyncMillis !== undefined && lastSuccessSyncMillis === -2) {
      lastSyncMsg = t("statusbar_failed");
      lastSyncLabelMsg = t("statusbar_failed");
    }

    if (lastSuccessSyncMillis !== undefined && lastSuccessSyncMillis > 0) {
      const deltaTime = Date.now() - lastSuccessSyncMillis;

      // create human readable time
      const years = Math.floor(deltaTime / 31556952000);
      const months = Math.floor(deltaTime / 2629746000);
      const weeks = Math.floor(deltaTime / 604800000);
      const days = Math.floor(deltaTime / 86400000);
      const hours = Math.floor(deltaTime / 3600000);
      const minutes = Math.floor(deltaTime / 60000);
      const seconds = Math.floor(deltaTime / 1000);

      let timeText = "";

      if (years > 0) {
        timeText = t("statusbar_time_years", { time: years });
      } else if (months > 0) {
        timeText = t("statusbar_time_months", { time: months });
      } else if (weeks > 0) {
        timeText = t("statusbar_time_weeks", { time: weeks });
      } else if (days > 0) {
        timeText = t("statusbar_time_days", { time: days });
      } else if (hours > 0) {
        timeText = t("statusbar_time_hours", { time: hours });
      } else if (minutes > 0) {
        timeText = t("statusbar_time_minutes", { time: minutes });
      } else if (seconds > 30) {
        timeText = t("statusbar_time_lessminute");
      } else {
        timeText = t("statusbar_now");
      }

      const dateText = new Date(lastSuccessSyncMillis).toLocaleTimeString(
        navigator.language,
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }
      );

      lastSyncMsg = timeText;
      lastSyncLabelMsg = t("statusbar_lastsync_label", { date: dateText });
    }

    this.statusBarElement.setText(lastSyncMsg);
    this.statusBarElement.setAttribute("aria-label", lastSyncLabelMsg);
  }

  /**
   * Because data.json contains sensitive information,
   * We usually want to ignore it in the version control.
   * However, if there's already a an ignore file (even empty),
   * we respect the existing configure and not add any modifications.
   * @returns
   */
  async tryToAddIgnoreFile() {
    const pluginConfigDir =
      this.manifest.dir ||
      `${this.app.vault.configDir}/plugins/${this.manifest.dir}`;
    const pluginConfigDirExists =
      await this.app.vault.adapter.exists(pluginConfigDir);
    if (!pluginConfigDirExists) {
      // what happened?
      return;
    }
    const ignoreFile = `${pluginConfigDir}/.gitignore`;
    const ignoreFileExists = await this.app.vault.adapter.exists(ignoreFile);

    const contentText = "data.json\n";

    try {
      if (!ignoreFileExists) {
        // not exists, directly create
        // no need to await
        this.app.vault.adapter.write(ignoreFile, contentText);
      }
    } catch (error) {
      // just skip
    }
  }

  enableAutoClearOutputToDBHistIfSet() {
    const initClearOutputToDBHistAfterMilliseconds = 1000 * 30;

    this.app.workspace.onLayoutReady(() => {
      // init run
      window.setTimeout(() => {
        clearAllLoggerOutputRecords(this.db);
      }, initClearOutputToDBHistAfterMilliseconds);
    });
  }

  enableAutoClearSyncPlanHist() {
    const initClearSyncPlanHistAfterMilliseconds = 1000 * 45;
    const autoClearSyncPlanHistAfterMilliseconds = 1000 * 60 * 5;

    this.app.workspace.onLayoutReady(() => {
      // init run
      window.setTimeout(() => {
        clearExpiredSyncPlanRecords(this.db);
      }, initClearSyncPlanHistAfterMilliseconds);

      // scheduled run
      const intervalID = window.setInterval(() => {
        clearExpiredSyncPlanRecords(this.db);
      }, autoClearSyncPlanHistAfterMilliseconds);
      this.registerInterval(intervalID);
    });
  }
}
