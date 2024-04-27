/**
 * Only type defs here.
 * To avoid circular dependency.
 */

import { Platform, requireApiVersion } from "obsidian";
import type { LangType, LangTypeAndAuto } from "./i18n";

export const DEFAULT_CONTENT_TYPE = "application/octet-stream";

export type SUPPORTED_SERVICES_TYPE = "s3" | "webdav" | "dropbox" | "onedrive";

export type SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR =
  | "webdav"
  | "dropbox"
  | "onedrive";

export interface S3Config {
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
  s3BucketName: string;

  partsConcurrency?: number;
  forcePathStyle?: boolean;
  remotePrefix?: string;

  useAccurateMTime?: boolean;
  reverseProxyNoSignUrl?: string;

  generateFolderObject?: boolean;

  /**
   * @deprecated
   */
  bypassCorsLocally?: boolean;
}

export interface DropboxConfig {
  accessToken: string;
  clientID: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  accessTokenExpiresAtTime: number;
  accountID: string;
  username: string;
  credentialsShouldBeDeletedAtTime?: number;
  remoteBaseDir?: string;
}

export type WebdavAuthType = "digest" | "basic";
export type WebdavDepthType =
  | "auto" // deprecated on 20240116
  | "auto_unknown" // deprecated on 20240116
  | "auto_1" // deprecated on 20240116
  | "auto_infinity" // deprecated on 20240116
  | "manual_1"
  | "manual_infinity";

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: WebdavAuthType;

  depth?: WebdavDepthType;
  remoteBaseDir?: string;

  /**
   * @deprecated
   */
  manualRecursive: boolean; // deprecated in 0.3.6, use depth
}

export interface OnedriveConfig {
  accessToken: string;
  clientID: string;
  authority: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  accessTokenExpiresAtTime: number;
  deltaLink: string;
  username: string;
  credentialsShouldBeDeletedAtTime?: number;
  remoteBaseDir?: string;
}

export type SyncDirectionType =
  | "bidirectional"
  | "incremental_pull_only"
  | "incremental_push_only";

export type CipherMethodType = "rclone-base64" | "openssl-base64" | "unknown";

export type QRExportType = "all_but_oauth2" | "dropbox" | "onedrive";

export interface RemotelySavePluginSettings {
  s3: S3Config;
  webdav: WebdavConfig;
  dropbox: DropboxConfig;
  onedrive: OnedriveConfig;
  password: string;
  serviceType: SUPPORTED_SERVICES_TYPE;
  currLogLevel?: string;
  autoRunEveryMilliseconds?: number;
  initRunAfterMilliseconds?: number;
  syncOnSaveAfterMilliseconds?: number;

  concurrency?: number;
  syncConfigDir?: boolean;
  syncUnderscoreItems?: boolean;
  lang?: LangTypeAndAuto;
  agreeToUseSyncV3?: boolean;
  skipSizeLargerThan?: number;
  ignorePaths?: string[];
  enableStatusBarInfo?: boolean;
  deleteToWhere?: "system" | "obsidian";
  conflictAction?: ConflictActionType;
  howToCleanEmptyFolder?: EmptyFolderCleanType;

  protectModifyPercentage?: number;
  syncDirection?: SyncDirectionType;

  obfuscateSettingFile?: boolean;

  enableMobileStatusBar?: boolean;

  encryptionMethod?: CipherMethodType;

  /**
   * @deprecated
   */
  agreeToUploadExtraMetadata?: boolean;

  /**
   * @deprecated
   */
  vaultRandomID?: string;

  /**
   * @deprecated
   */
  logToDB?: boolean;
}

export const COMMAND_URI = "remotely-save";
export const COMMAND_CALLBACK = "remotely-save-cb";
export const COMMAND_CALLBACK_ONEDRIVE = "remotely-save-cb-onedrive";
export const COMMAND_CALLBACK_DROPBOX = "remotely-save-cb-dropbox";

export interface UriParams {
  func?: string;
  vault?: string;
  ver?: string;
  data?: string;
}

// 80 days
export const OAUTH2_FORCE_EXPIRE_MILLISECONDS = 1000 * 60 * 60 * 24 * 80;

export type EmptyFolderCleanType = "skip" | "clean_both";

export type ConflictActionType = "keep_newer" | "keep_larger" | "rename_both";

export type DecisionTypeForMixedEntity =
  | "only_history"
  | "equal"
  | "local_is_modified_then_push"
  | "remote_is_modified_then_pull"
  | "local_is_created_then_push"
  | "remote_is_created_then_pull"
  | "local_is_created_too_large_then_do_nothing"
  | "remote_is_created_too_large_then_do_nothing"
  | "local_is_deleted_thus_also_delete_remote"
  | "remote_is_deleted_thus_also_delete_local"
  | "conflict_created_then_keep_local"
  | "conflict_created_then_keep_remote"
  | "conflict_created_then_keep_both"
  | "conflict_created_then_do_nothing"
  | "conflict_modified_then_keep_local"
  | "conflict_modified_then_keep_remote"
  | "conflict_modified_then_keep_both"
  | "folder_existed_both_then_do_nothing"
  | "folder_existed_local_then_also_create_remote"
  | "folder_existed_remote_then_also_create_local"
  | "folder_to_be_created"
  | "folder_to_skip"
  | "folder_to_be_deleted_on_both"
  | "folder_to_be_deleted_on_remote"
  | "folder_to_be_deleted_on_local";

/**
 * uniform representation
 * everything should be flat and primitive, so that we can copy.
 */
export interface Entity {
  key?: string;
  keyEnc?: string;
  keyRaw: string;
  mtimeCli?: number;
  mtimeCliFmt?: string;
  mtimeSvr?: number;
  mtimeSvrFmt?: string;
  prevSyncTime?: number;
  prevSyncTimeFmt?: string;
  size?: number; // might be unknown or to be filled
  sizeEnc?: number;
  sizeRaw: number;
  hash?: string;
  etag?: string;
  synthesizedFolder?: boolean;
}

export interface UploadedType {
  entity: Entity;
  mtimeCli?: number;
}

/**
 * A replacement of FileOrFolderMixedState
 */
export interface MixedEntity {
  key: string;
  local?: Entity;
  prevSync?: Entity;
  remote?: Entity;

  decisionBranch?: number;
  decision?: DecisionTypeForMixedEntity;
  conflictAction?: ConflictActionType;

  sideNotes?: any;
}

/**
 * @deprecated
 */
export interface FileOrFolderMixedState {
  key: string;
  existLocal?: boolean;
  existRemote?: boolean;
  mtimeLocal?: number;
  mtimeRemote?: number;
  deltimeLocal?: number;
  deltimeRemote?: number;
  sizeLocal?: number;
  sizeLocalEnc?: number;
  sizeRemote?: number;
  sizeRemoteEnc?: number;
  changeRemoteMtimeUsingMapping?: boolean;
  changeLocalMtimeUsingMapping?: boolean;
  decision?: string; // old DecisionType is deleted, fallback to string
  decisionBranch?: number;
  syncDone?: "done";
  remoteEncryptedKey?: string;

  mtimeLocalFmt?: string;
  mtimeRemoteFmt?: string;
  deltimeLocalFmt?: string;
  deltimeRemoteFmt?: string;
}

export const API_VER_STAT_FOLDER = "0.13.27";
export const API_VER_REQURL = "0.13.26"; // desktop ver 0.13.26, iOS ver 1.1.1
export const API_VER_REQURL_ANDROID = "0.14.6"; // Android ver 1.2.1
export const API_VER_ENSURE_REQURL_OK = "1.0.0"; // always bypass CORS here

export const VALID_REQURL =
  (!Platform.isAndroidApp && requireApiVersion(API_VER_REQURL)) ||
  (Platform.isAndroidApp && requireApiVersion(API_VER_REQURL_ANDROID));

export const DEFAULT_DEBUG_FOLDER = "_debug_remotely_save/";
export const DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX =
  "sync_plans_hist_exported_on_";
export const DEFAULT_LOG_HISTORY_FILE_PREFIX = "log_hist_exported_on_";
export const DEFAULT_PROFILER_RESULT_FILE_PREFIX =
  "profiler_results_exported_on_";

export type SyncTriggerSourceType =
  | "manual"
  | "dry"
  | "auto"
  | "auto_once_init"
  | "auto_sync_on_save";

export const REMOTELY_SAVE_VERSION_2022 = "0.3.25";
export const REMOTELY_SAVE_VERSION_2024PREPARE = "0.3.32";
