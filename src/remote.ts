import { Vault } from "obsidian";

import type { SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import * as s3 from "./s3";
import * as webdav from "./webdav";
import * as dropbox from "./remoteForDropbox";

export class RemoteClient {
  readonly serviceType: SUPPORTED_SERVICES_TYPE;
  readonly s3Client?: s3.S3Client;
  readonly s3Config?: s3.S3Config;
  readonly webdavClient?: webdav.WebDAVClient;
  readonly webdavConfig?: webdav.WebdavConfig;
  readonly dropboxClient?: dropbox.Dropbox;
  readonly dropboxConfig?: dropbox.DropboxConfig;

  constructor(
    serviceType: SUPPORTED_SERVICES_TYPE,
    s3Config?: s3.S3Config,
    webdavConfig?: webdav.WebdavConfig,
    dropboxConfig?: dropbox.DropboxConfig
  ) {
    this.serviceType = serviceType;
    if (serviceType === "s3") {
      this.s3Config = { ...s3Config };
      this.s3Client = s3.getS3Client(this.s3Config);
    } else if (serviceType === "webdav") {
      this.webdavConfig = { ...webdavConfig };
      this.webdavClient = webdav.getWebdavClient(this.webdavConfig);
    } else if (serviceType === "dropbox") {
      this.dropboxConfig = { ...dropboxConfig };
      this.dropboxClient = dropbox.getDropboxClient(this.dropboxConfig);
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  }

  getRemoteMeta = async (fileOrFolderPath: string) => {
    if (this.serviceType === "s3") {
      return await s3.getRemoteMeta(
        this.s3Client,
        this.s3Config,
        fileOrFolderPath
      );
    } else if (this.serviceType === "webdav") {
      return await webdav.getRemoteMeta(this.webdavClient, fileOrFolderPath);
    } else if (this.serviceType === "dropbox") {
      return await dropbox.getRemoteMeta(this.dropboxClient, fileOrFolderPath);
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  uploadToRemote = async (
    fileOrFolderPath: string,
    vault: Vault,
    isRecursively: boolean = false,
    password: string = "",
    remoteEncryptedKey: string = "",
    foldersCreatedBefore: Set<string> | undefined = undefined
  ) => {
    if (this.serviceType === "s3") {
      return await s3.uploadToRemote(
        this.s3Client,
        this.s3Config,
        fileOrFolderPath,
        vault,
        isRecursively,
        password,
        remoteEncryptedKey
      );
    } else if (this.serviceType === "webdav") {
      return await webdav.uploadToRemote(
        this.webdavClient,
        fileOrFolderPath,
        vault,
        isRecursively,
        password,
        remoteEncryptedKey
      );
    } else if (this.serviceType === "dropbox") {
      return await dropbox.uploadToRemote(
        this.dropboxClient,
        fileOrFolderPath,
        vault,
        isRecursively,
        password,
        remoteEncryptedKey,
        foldersCreatedBefore
      );
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  listFromRemote = async (prefix?: string) => {
    if (this.serviceType === "s3") {
      return await s3.listFromRemote(this.s3Client, this.s3Config, prefix);
    } else if (this.serviceType === "webdav") {
      return await webdav.listFromRemote(this.webdavClient, prefix);
    } else if (this.serviceType === "dropbox") {
      return await dropbox.listFromRemote(this.dropboxClient, prefix);
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  downloadFromRemote = async (
    fileOrFolderPath: string,
    vault: Vault,
    mtime: number,
    password: string = "",
    remoteEncryptedKey: string = ""
  ) => {
    if (this.serviceType === "s3") {
      return await s3.downloadFromRemote(
        this.s3Client,
        this.s3Config,
        fileOrFolderPath,
        vault,
        mtime,
        password,
        remoteEncryptedKey
      );
    } else if (this.serviceType === "webdav") {
      return await webdav.downloadFromRemote(
        this.webdavClient,
        fileOrFolderPath,
        vault,
        mtime,
        password,
        remoteEncryptedKey
      );
    } else if (this.serviceType === "dropbox") {
      return await dropbox.downloadFromRemote(
        this.dropboxClient,
        fileOrFolderPath,
        vault,
        mtime,
        password,
        remoteEncryptedKey
      );
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  deleteFromRemote = async (
    fileOrFolderPath: string,
    password: string = "",
    remoteEncryptedKey: string = ""
  ) => {
    if (this.serviceType === "s3") {
      return await s3.deleteFromRemote(
        this.s3Client,
        this.s3Config,
        fileOrFolderPath,
        password,
        remoteEncryptedKey
      );
    } else if (this.serviceType === "webdav") {
      return await webdav.deleteFromRemote(
        this.webdavClient,
        fileOrFolderPath,
        password,
        remoteEncryptedKey
      );
    } else if (this.serviceType === "dropbox") {
      return await dropbox.deleteFromRemote(
        this.dropboxClient,
        fileOrFolderPath,
        password,
        remoteEncryptedKey
      );
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  checkConnectivity = async () => {
    if (this.serviceType === "s3") {
      return await s3.checkConnectivity(this.s3Client, this.s3Config);
    } else if (this.serviceType === "webdav") {
      return await webdav.checkConnectivity(this.webdavClient);
    } else if (this.serviceType === "dropbox") {
      return await dropbox.checkConnectivity(this.dropboxClient);
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  getUser = async () => {
    if (this.serviceType === "dropbox") {
      return await dropbox.getUserDisplayName(this.dropboxClient);
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  revokeAuth = async () => {
    if (this.serviceType === "dropbox") {
      return await dropbox.revokeAuth(this.dropboxClient);
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };
}
