/**
 * Only type defs here.
 * To avoid circular dependency.
 */

export type SUPPORTED_SERVICES_TYPE = "s3" | "webdav" | "dropbox";

export interface S3Config {
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
}

export interface DropboxConfig {
  accessToken: string;
  clientID: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  accessTokenExpiresAtTime: number;
  accountID: string;
  username: string;
}

export type WebdavAuthType = "digest" | "basic";

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: WebdavAuthType;
}

export interface RemotelySavePluginSettings {
  s3: S3Config;
  webdav: WebdavConfig;
  dropbox: DropboxConfig;
  password: string;
  serviceType: SUPPORTED_SERVICES_TYPE;
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

export interface UriParams {
  func?: string;
  vault?: string;
  ver?: string;
  data?: string;
}