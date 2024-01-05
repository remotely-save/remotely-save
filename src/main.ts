import {
  Modal,
  Notice,
  Plugin,
  Setting,
  addIcon,
  setIcon,
  FileSystemAdapter,
  Platform,
} from "obsidian";
import cloneDeep from "lodash/cloneDeep";
import { createElement, RotateCcw, RefreshCcw, FileText } from "lucide";
import type {
  FileOrFolderMixedState,
  RemotelySavePluginSettings,
  SyncTriggerSourceType,
} from "./baseTypes";
import {
  COMMAND_CALLBACK,
  COMMAND_CALLBACK_ONEDRIVE,
  COMMAND_CALLBACK_DROPBOX,
  COMMAND_URI,
} from "./baseTypes";
import { importQrCodeUri } from "./importExport";
import {
  insertDeleteRecordByVault,
  insertRenameRecordByVault,
  insertSyncPlanRecordByVault,
  loadFileHistoryTableByVault,
  prepareDBs,
  InternalDBs,
  insertLoggerOutputByVault,
  clearExpiredLoggerOutputRecords,
  clearExpiredSyncPlanRecords,
  upsertLastSuccessSyncByVault,
  getLastSuccessSyncByVault,
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
import { fetchMetadataFile, parseRemoteItems, SyncStatusType } from "./sync";
import { doActualSync, getSyncPlan, isPasswordOk } from "./sync";
import { messyConfigToNormal, normalConfigToMessy } from "./configPersist";
import { ObsConfigDirFileType, listFilesInObsFolder } from "./obsFolderLister";
import { I18n } from "./i18n";
import type { LangType, LangTypeAndAuto, TransItemType } from "./i18n";

import { DeletionOnRemote, MetadataOnRemote } from "./metadataOnRemote";
import { SyncAlgoV2Modal } from "./syncAlgoV2Notice";
import { applyPresetRulesInplace } from "./presetRules";

import { applyLogWriterInplace, log } from "./moreOnLog";
import AggregateError from "aggregate-error";
import {
  exportVaultLoggerOutputToFiles,
  exportVaultSyncPlansToFiles,
} from "./debugMode";
import { SizesConflictModal } from "./syncSizesConflictNotice";

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
  s3: DEFAULT_S3_CONFIG,
  webdav: DEFAULT_WEBDAV_CONFIG,
  dropbox: DEFAULT_DROPBOX_CONFIG,
  onedrive: DEFAULT_ONEDRIVE_CONFIG,
  password: "",
  serviceType: "s3",
  currLogLevel: "info",
  // vaultRandomID: "", // deprecated
  autoRunEveryMilliseconds: -1,
  initRunAfterMilliseconds: -1,
  agreeToUploadExtraMetadata: false,
  concurrency: 5,
  syncConfigDir: false,
  syncUnderscoreItems: false,
  lang: "auto",
  logToDB: false,
  skipSizeLargerThan: -1,
  ignorePaths: [],
  enableStatusBarInfo: true,
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
  settings: RemotelySavePluginSettings;
  db: InternalDBs;
  syncStatus: SyncStatusType;
  statusBarElement: HTMLSpanElement;
  oauth2Info: OAuth2Info;
  currLogLevel: string;
  currSyncMsg?: string;
  syncRibbon?: HTMLElement;
  autoRunIntervalID?: number;
  i18n: I18n;
  vaultRandomID: string;

  async syncRun(triggerSource: SyncTriggerSourceType = "manual") {
    const t = (x: TransItemType, vars?: any) => {
      return this.i18n.t(x, vars);
    };

    const getNotice = (x: string, timeout?: number) => {
      // only show notices in manual mode
      // no notice in auto mode
      if (triggerSource === "manual" || triggerSource === "dry") {
        new Notice(x, timeout);
      }
    };
    if (this.syncStatus !== "idle") {
      // here the notice is shown regardless of triggerSource
      new Notice(
        t("syncrun_alreadyrunning", {
          pluginName: this.manifest.name,
          syncStatus: this.syncStatus,
        })
      );
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
          t("syncrun_syncingribbon", {
            pluginName: this.manifest.name,
            triggerSource: triggerSource,
          })
        );
      }

      const MAX_STEPS = 8;

      if (triggerSource === "dry") {
        getNotice(
          t("syncrun_step0", {
            maxSteps: `${MAX_STEPS}`,
          })
        );
      }

      //log.info(`huh ${this.settings.password}`)
      getNotice(
        t("syncrun_step1", {
          maxSteps: `${MAX_STEPS}`,
          serviceType: this.settings.serviceType,
        })
      );
      this.syncStatus = "preparing";

      getNotice(
        t("syncrun_step2", {
          maxSteps: `${MAX_STEPS}`,
        })
      );
      this.syncStatus = "getting_remote_files_list";
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
      // log.debug(remoteRsp);

      getNotice(
        t("syncrun_step3", {
          maxSteps: `${MAX_STEPS}`,
        })
      );
      this.syncStatus = "checking_password";
      const passwordCheckResult = await isPasswordOk(
        remoteRsp.Contents,
        this.settings.password
      );
      if (!passwordCheckResult.ok) {
        getNotice(t("syncrun_passworderr"));
        throw Error(passwordCheckResult.reason);
      }

      getNotice(
        t("syncrun_step4", {
          maxSteps: `${MAX_STEPS}`,
        })
      );
      this.syncStatus = "getting_remote_extra_meta";
      const { remoteStates, metadataFile } = await parseRemoteItems(
        remoteRsp.Contents,
        this.db,
        this.vaultRandomID,
        client.serviceType,
        this.settings.password
      );
      const origMetadataOnRemote = await fetchMetadataFile(
        metadataFile,
        client,
        this.app.vault,
        this.settings.password
      );

      getNotice(
        t("syncrun_step5", {
          maxSteps: `${MAX_STEPS}`,
        })
      );
      this.syncStatus = "getting_local_meta";
      const local = this.app.vault.getAllLoadedFiles();
      const localHistory = await loadFileHistoryTableByVault(
        this.db,
        this.vaultRandomID
      );
      let localConfigDirContents: ObsConfigDirFileType[] = undefined;
      if (this.settings.syncConfigDir) {
        localConfigDirContents = await listFilesInObsFolder(
          this.app.vault.configDir,
          this.app.vault,
          this.manifest.id
        );
      }
      // log.info(local);
      // log.info(localHistory);

      getNotice(
        t("syncrun_step6", {
          maxSteps: `${MAX_STEPS}`,
        })
      );
      this.syncStatus = "generating_plan";
      const { plan, sortedKeys, deletions, sizesGoWrong } = await getSyncPlan(
        remoteStates,
        local,
        localConfigDirContents,
        origMetadataOnRemote.deletions,
        localHistory,
        client.serviceType,
        triggerSource,
        this.app.vault,
        this.settings.syncConfigDir,
        this.app.vault.configDir,
        this.settings.syncUnderscoreItems,
        this.settings.skipSizeLargerThan,
        this.settings.ignorePaths,
        this.settings.password
      );
      log.info(plan.mixedStates); // for debugging
      await insertSyncPlanRecordByVault(this.db, plan, this.vaultRandomID);

      // The operations above are almost read only and kind of safe.
      // The operations below begins to write or delete (!!!) something.

      if (triggerSource !== "dry") {
        getNotice(
          t("syncrun_step7", {
            maxSteps: `${MAX_STEPS}`,
          })
        );

        this.syncStatus = "syncing";
        await doActualSync(
          client,
          this.db,
          this.vaultRandomID,
          this.app.vault,
          plan,
          sortedKeys,
          metadataFile,
          origMetadataOnRemote,
          sizesGoWrong,
          deletions,
          (key: string) => self.trash(key),
          this.settings.password,
          this.settings.concurrency,
          (ss: FileOrFolderMixedState[]) => {
            new SizesConflictModal(
              self.app,
              self,
              this.settings.skipSizeLargerThan,
              ss,
              this.settings.password !== ""
            ).open();
          },
          (i: number, totalCount: number, pathName: string, decision: string) =>
            self.setCurrSyncMsg(i, totalCount, pathName, decision)
        );
      } else {
        this.syncStatus = "syncing";
        getNotice(
          t("syncrun_step7skip", {
            maxSteps: `${MAX_STEPS}`,
          })
        );
      }

      getNotice(
        t("syncrun_step8", {
          maxSteps: `${MAX_STEPS}`,
        })
      );
      this.syncStatus = "finish";
      this.syncStatus = "idle";

      const lastSuccessSyncMillis = Date.now();
      await upsertLastSuccessSyncByVault(
        this.db,
        this.vaultRandomID,
        lastSuccessSyncMillis
      );

      if (this.syncRibbon !== undefined) {
        setIcon(this.syncRibbon, iconNameSyncWait);
        this.syncRibbon.setAttribute("aria-label", originLabel);
      }

      if (this.statusBarElement !== undefined) {
        this.updateLastSuccessSyncMsg(lastSuccessSyncMillis);
      }

      log.info(
        `${
          this.manifest.id
        }-${Date.now()}: finish sync, triggerSource=${triggerSource}`
      );
    } catch (error) {
      const msg = t("syncrun_abort", {
        manifestID: this.manifest.id,
        theDate: `${Date.now()}`,
        triggerSource: triggerSource,
        syncStatus: this.syncStatus,
      });
      log.error(msg);
      log.error(error);
      getNotice(msg, 10 * 1000);
      if (error instanceof AggregateError) {
        for (const e of error.errors) {
          getNotice(e.message, 10 * 1000);
        }
      } else {
        getNotice(error.message, 10 * 1000);
      }
      this.syncStatus = "idle";
      if (this.syncRibbon !== undefined) {
        setIcon(this.syncRibbon, iconNameSyncWait);
        this.syncRibbon.setAttribute("aria-label", originLabel);
      }
    }
  }

  async onload() {
    log.info(`loading plugin ${this.manifest.id}`);

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

    await this.loadSettings();
    await this.checkIfPresetRulesFollowed();

    // lang should be load early, but after settings
    this.i18n = new I18n(this.settings.lang, async (lang: LangTypeAndAuto) => {
      this.settings.lang = lang;
      await this.saveSettings();
    });
    const t = (x: TransItemType, vars?: any) => {
      return this.i18n.t(x, vars);
    };

    if (this.settings.currLogLevel !== undefined) {
      log.setLevel(this.settings.currLogLevel as any);
    }

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
        vaultRandomIDFromOldConfigFile
      );
    } catch (err) {
      new Notice(err.message, 10 * 1000);
      throw err;
    }

    // must AFTER preparing DB
    this.addOutputToDBIfSet();
    this.enableAutoClearOutputToDBHistIfSet();

    // must AFTER preparing DB
    this.enableAutoClearSyncPlanHist();

    this.syncStatus = "idle";

    this.registerEvent(
      this.app.vault.on("delete", async (fileOrFolder) => {
        await insertDeleteRecordByVault(
          this.db,
          fileOrFolder,
          this.vaultRandomID
        );
      })
    );

    this.registerEvent(
      this.app.vault.on("rename", async (fileOrFolder, oldPath) => {
        await insertRenameRecordByVault(
          this.db,
          fileOrFolder,
          oldPath,
          this.vaultRandomID
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
        if (inputParams.code !== undefined) {
          if (this.oauth2Info.helperModal !== undefined) {
            this.oauth2Info.helperModal.contentEl.empty();

            t("protocol_dropbox_connecting")
              .split("\n")
              .forEach((val) => {
                this.oauth2Info.helperModal.contentEl.createEl("p", {
                  text: val,
                });
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
        if (inputParams.code !== undefined) {
          if (this.oauth2Info.helperModal !== undefined) {
            this.oauth2Info.helperModal.contentEl.empty();

            t("protocol_onedrive_connecting")
              .split("\n")
              .forEach((val) => {
                this.oauth2Info.helperModal.contentEl.createEl("p", {
                  text: val,
                });
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

    this.syncRibbon = this.addRibbonIcon(
      iconNameSyncWait,
      `${this.manifest.name}`,
      async () => this.syncRun("manual")
    );

    // Create Status Bar Item (not supported on mobile)
    if (!Platform.isMobileApp && this.settings.enableStatusBarInfo === true) {
      const statusBarItem = this.addStatusBarItem();
      this.statusBarElement = statusBarItem.createEl("span");
      this.statusBarElement.setAttribute("aria-label-position", "top");

      this.updateLastSuccessSyncMsg(
        await getLastSuccessSyncByVault(this.db, this.vaultRandomID)
      );
      // update statusbar text every 30 seconds
      this.registerInterval(
        window.setInterval(async () => {
          this.updateLastSuccessSyncMsg(
            await getLastSuccessSyncByVault(this.db, this.vaultRandomID)
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
      id: "export-sync-plans-json",
      name: t("command_exportsyncplans_json"),
      icon: iconNameLogs,
      callback: async () => {
        await exportVaultSyncPlansToFiles(
          this.db,
          this.app.vault,
          this.vaultRandomID,
          "json"
        );
        new Notice(t("settings_syncplans_notice"));
      },
    });

    this.addCommand({
      id: "export-sync-plans-table",
      name: t("command_exportsyncplans_table"),
      icon: iconNameLogs,
      callback: async () => {
        await exportVaultSyncPlansToFiles(
          this.db,
          this.app.vault,
          this.vaultRandomID,
          "table"
        );
        new Notice(t("settings_syncplans_notice"));
      },
    });

    this.addCommand({
      id: "export-logs-in-db",
      name: t("command_exportlogsindb"),
      icon: iconNameLogs,
      callback: async () => {
        await exportVaultLoggerOutputToFiles(
          this.db,
          this.app.vault,
          this.vaultRandomID
        );
        new Notice(t("settings_logtodbexport_notice"));
      },
    });

    this.addSettingTab(new RemotelySaveSettingTab(this.app, this));

    // this.registerDomEvent(document, "click", (evt: MouseEvent) => {
    //   log.info("click", evt);
    // });

    if (!this.settings.agreeToUploadExtraMetadata) {
      const syncAlgoV2Modal = new SyncAlgoV2Modal(this.app, this);
      syncAlgoV2Modal.open();
    } else {
      this.enableAutoSyncIfSet();
      this.enableInitSyncIfSet();
    }
  }

  async onunload() {
    log.info(`unloading plugin ${this.manifest.id}`);
    this.syncRibbon = undefined;
    if (this.oauth2Info !== undefined) {
      this.oauth2Info.helperModal = undefined;
      this.oauth2Info = undefined;
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
    if (this.settings.webdav.manualRecursive === undefined) {
      this.settings.webdav.manualRecursive = false;
    }
    if (this.settings.webdav.depth === undefined) {
      this.settings.webdav.depth = "auto_unknown";
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
    if (this.settings.ignorePaths === undefined) {
      this.settings.ignorePaths = [];
    }
    if (this.settings.enableStatusBarInfo === undefined) {
      this.settings.enableStatusBarInfo = true;
    }
  }

  async checkIfPresetRulesFollowed() {
    const res = applyPresetRulesInplace(this.settings);
    if (res.changed) {
      await this.saveSettings();
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

  async getVaultRandomIDFromOldConfigFile() {
    let vaultRandomID = "";
    if (this.settings.vaultRandomID !== undefined) {
      // In old version, the vault id is saved in data.json
      // But we want to store it in localForage later
      if (this.settings.vaultRandomID !== "") {
        // a real string was assigned before
        vaultRandomID = this.settings.vaultRandomID;
      }
      log.debug("vaultRandomID is no longer saved in data.json");
      delete this.settings.vaultRandomID;
      await this.saveSettings();
    }
    return vaultRandomID;
  }

  async trash(x: string) {
    if (!(await this.app.vault.adapter.trashSystem(x))) {
      await this.app.vault.adapter.trashLocal(x);
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
    vaultRandomIDFromOldConfigFile: string
  ) {
    const { db, vaultRandomID } = await prepareDBs(
      vaultBasePath,
      vaultRandomIDFromOldConfigFile
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
          this.syncRun("autoOnceInit");
        }, this.settings.initRunAfterMilliseconds);
      });
    }
  }

  async saveAgreeToUseNewSyncAlgorithm() {
    this.settings.agreeToUploadExtraMetadata = true;
    await this.saveSettings();
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

  updateLastSuccessSyncMsg(lastSuccessSyncMillis?: number) {
    if (this.statusBarElement === undefined) return;

    const t = (x: TransItemType, vars?: any) => {
      return this.i18n.t(x, vars);
    };

    let lastSyncMsg = t("statusbar_lastsync_never");
    let lastSyncLabelMsg = t("statusbar_lastsync_never_label");

    if (lastSuccessSyncMillis !== undefined && lastSuccessSyncMillis > 0) {
      const deltaTime = Date.now() - lastSuccessSyncMillis;

      // create human readable time
      const years = Math.floor(deltaTime / 31556952000);
      const months = Math.floor(deltaTime / 2629746000);
      const weeks = Math.floor(deltaTime / 604800000);
      const days = Math.floor(deltaTime / 86400000);
      const hours = Math.floor(deltaTime / 3600000);
      const minutes = Math.floor(deltaTime / 60000);
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
      } else {
        timeText = t("statusbar_time_lessminute");
      }

      let dateText = new Date(lastSuccessSyncMillis).toLocaleTimeString(
        navigator.language,
        {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        }
      );

      lastSyncMsg = t("statusbar_lastsync", { time: timeText });
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

  addOutputToDBIfSet() {
    if (this.settings.logToDB) {
      applyLogWriterInplace((...msg: any[]) => {
        insertLoggerOutputByVault(this.db, this.vaultRandomID, ...msg);
      });
    }
  }

  enableAutoClearOutputToDBHistIfSet() {
    const initClearOutputToDBHistAfterMilliseconds = 1000 * 45;
    const autoClearOutputToDBHistAfterMilliseconds = 1000 * 60 * 5;

    this.app.workspace.onLayoutReady(() => {
      // init run
      window.setTimeout(() => {
        if (this.settings.logToDB) {
          clearExpiredLoggerOutputRecords(this.db);
        }
      }, initClearOutputToDBHistAfterMilliseconds);

      // scheduled run
      const intervalID = window.setInterval(() => {
        if (this.settings.logToDB) {
          clearExpiredLoggerOutputRecords(this.db);
        }
      }, autoClearOutputToDBHistAfterMilliseconds);
      this.registerInterval(intervalID);
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
