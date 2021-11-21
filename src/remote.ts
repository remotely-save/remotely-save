import { Vault } from "obsidian";

import type { SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import * as s3 from "./s3";
import * as webdav from "./webdav";

export class RemoteClient {
  readonly serviceType: SUPPORTED_SERVICES_TYPE;
  readonly s3Client?: s3.S3Client;
  readonly s3Config?: s3.S3Config;
  readonly webdavClient?: webdav.WebDAVClient;
  readonly webdavConfig?: webdav.WebdavConfig;

  constructor(
    serviceType: SUPPORTED_SERVICES_TYPE,
    s3Config?: s3.S3Config,
    webdavConfig?: webdav.WebdavConfig
  ) {
    this.serviceType = serviceType;
    if (serviceType === "s3") {
      this.s3Config = s3Config;
      this.s3Client = s3.getS3Client(s3Config);
    } else if (serviceType === "webdav") {
      this.webdavConfig = webdavConfig;
      this.webdavClient = webdav.getWebdavClient(webdavConfig);
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
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  uploadToRemote = async (
    fileOrFolderPath: string,
    vault: Vault,
    isRecursively: boolean = false,
    password: string = "",
    remoteEncryptedKey: string = ""
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
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  listFromRemote = async (prefix?: string) => {
    if (this.serviceType === "s3") {
      return await s3.listFromRemote(this.s3Client, this.s3Config, prefix);
    } else if (this.serviceType === "webdav") {
      return await webdav.listFromRemote(this.webdavClient, prefix);
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
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };

  checkConnectivity = async () => {
    if (this.serviceType === "s3") {
      return await s3.checkConnectivity(this.s3Client, this.s3Config);
    } else if (this.serviceType === "webdav") {
      return await webdav.checkConnectivity(this.webdavClient);
    } else {
      throw Error(`not supported service type ${this.serviceType}`);
    }
  };
}
