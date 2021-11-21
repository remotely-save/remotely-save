/**
 * Only type defs here.
 */

export type SUPPORTED_SERVICES_TYPE = "s3" | "webdav";

export interface RemoteItem {
  key: string;
  lastModified: number;
  size: number;
  remoteType: SUPPORTED_SERVICES_TYPE;
  etag?: string;
}
