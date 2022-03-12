/**
 * Only type defs here.
 * To avoid circular dependency.
 */

export type SUPPORTED_SERVICES_TYPE = "s3" | "webdav" | "dropbox" | "onedrive";

export interface S3Config {
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
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
}

export type WebdavAuthType = "digest" | "basic";
export type WebdavDepthType =
  | "auto_unknown"
  | "auto_1"
  | "auto_infinity"
  | "manual_1"
  | "manual_infinity";

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: WebdavAuthType;
  manualRecursive: boolean; // deprecated in 0.3.6, use depth
  depth?: WebdavDepthType;
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
}

export interface RemotelySavePluginSettings {
  s3: S3Config;
  webdav: WebdavConfig;
  dropbox: DropboxConfig;
  onedrive: OnedriveConfig;
  password: string;
  serviceType: SUPPORTED_SERVICES_TYPE;
  currLogLevel?: string;
  vaultRandomID?: string;
  autoRunEveryMilliseconds?: number;
  initRunAfterMilliseconds?: number;
  agreeToUploadExtraMetadata?: boolean;
  concurrency?: number;
}

export interface RemoteItem {
  key: string;
  lastModified: number;
  size: number;
  remoteType: SUPPORTED_SERVICES_TYPE;
  etag?: string;
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

type DecisionTypeForFile =
  | "skipUploading" // special, mtimeLocal === mtimeRemote
  | "uploadLocalDelHistToRemote" // "delLocalIfExists && delRemoteIfExists && cleanLocalDelHist && uploadLocalDelHistToRemote"
  | "keepRemoteDelHist" // "delLocalIfExists && delRemoteIfExists && cleanLocalDelHist && keepRemoteDelHist"
  | "uploadLocalToRemote" // "skipLocal && uploadLocalToRemote && cleanLocalDelHist && cleanRemoteDelHist"
  | "downloadRemoteToLocal"; // "downloadRemoteToLocal && skipRemote && cleanLocalDelHist && cleanRemoteDelHist"

type DecisionTypeForFolder =
  | "createFolder"
  | "uploadLocalDelHistToRemoteFolder"
  | "keepRemoteDelHistFolder"
  | "skipFolder";

export type DecisionType = DecisionTypeForFile | DecisionTypeForFolder;

export interface FileOrFolderMixedState {
  key: string;
  existLocal?: boolean;
  existRemote?: boolean;
  mtimeLocal?: number;
  mtimeRemote?: number;
  deltimeLocal?: number;
  deltimeRemote?: number;
  sizeLocal?: number;
  sizeRemote?: number;
  changeMtimeUsingMapping?: boolean;
  decision?: DecisionType;
  decisionBranch?: number;
  syncDone?: "done";
  remoteEncryptedKey?: string;
}

export const API_VER_STAT_FOLDER = "0.13.27";
export const API_VER_REQURL = "0.13.26";
