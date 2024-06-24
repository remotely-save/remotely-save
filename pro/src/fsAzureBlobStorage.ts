import * as path from "path";
import {
  AnonymousCredential,
  BaseRequestPolicy,
  type BlobGetPropertiesResponse,
  BlobServiceClient,
  BlobUploadCommonResponse,
  BlockBlobClient,
  ContainerClient,
  newPipeline,
} from "@azure/storage-blob";
import type { Entity } from "../../src/baseTypes";
import { FakeFs } from "../../src/fsAll";
import { arrayBufferToHex, getFolderLevels } from "../../src/misc";
import type { AzureBlobStorageConfig } from "./baseTypesPro";

export const simpleTransRemotePrefix = (x: string) => {
  if (x === undefined) {
    return "";
  }
  let y = path.posix.normalize(x.trim());
  if (y === undefined || y === "" || y === "/" || y === ".") {
    return "";
  }
  if (y.startsWith("/")) {
    y = y.slice(1);
  }
  if (!y.endsWith("/")) {
    y = `${y}/`;
  }
  return y;
};

export const DEFAULT_AZUREBLOBSTORAGE_CONFIG: AzureBlobStorageConfig = {
  containerSasUrl: "",
  containerName: "",
  remotePrefix: "",
  generateFolderObject: false,
  partsConcurrency: 5,
  kind: "azureblobstorage",
};

const getNormPath = (fileOrFolderPath: string, remotePrefix: string) => {
  if (remotePrefix.startsWith("/") || !remotePrefix.endsWith("/")) {
    throw Error(
      `remotePrefix should not have leading slash but should have tailing slash: ${remotePrefix}`
    );
  }
  if (!fileOrFolderPath.startsWith(remotePrefix)) {
    throw Error(`${fileOrFolderPath} does not start with ${remotePrefix}!`);
  }
  return fileOrFolderPath.slice(remotePrefix.length);
};

const getBlobPath = (fileOrFolderPath: string, remotePrefix: string) => {
  if (remotePrefix.startsWith("/") || !remotePrefix.endsWith("/")) {
    throw Error(
      `remotePrefix should not have leading slash but should have tailing slash: ${remotePrefix}`
    );
  }
  return `${remotePrefix}${fileOrFolderPath}`;
};

const fromBlobPropsToEntity = (
  name: string,
  props: BlobGetPropertiesResponse,
  remotePrefix: string
): Entity => {
  const key = getNormPath(name, remotePrefix);

  let mtimeCli = props.lastModified!.valueOf();
  const mtimeStr = props.metadata?.mtime;
  if (mtimeStr !== undefined && mtimeStr !== "") {
    try {
      mtimeCli = new Date(mtimeStr).valueOf();
    } catch {}
  }

  let hash: undefined | string = undefined;
  if (props.contentMD5 !== undefined) {
    hash = arrayBufferToHex(props.contentMD5.buffer);
  }

  const entity: Entity = {
    key: key,
    keyRaw: key,
    mtimeCli: mtimeCli,
    mtimeSvr: props.lastModified!.valueOf(),
    size: props.contentLength ?? 0,
    sizeRaw: props.contentLength ?? 0,
    hash: hash,
  };

  if (key.endsWith("/")) {
    entity.synthesizedFolder = false;
  }

  return entity;
};

export class FakeFsAzureBlobStorage extends FakeFs {
  kind: string;
  config: AzureBlobStorageConfig;
  vaultName: string;
  containerClient: ContainerClient;
  remotePrefix: string;
  synthFoldersCache: Record<string, Entity>;

  constructor(config: AzureBlobStorageConfig, vaultName: string) {
    super();
    this.kind = "azureblobstorage";
    this.config = config;
    this.vaultName = vaultName;
    this.synthFoldersCache = {};

    this.remotePrefix = `${vaultName}/`;
    const k = simpleTransRemotePrefix(this.config.remotePrefix);
    if (k !== "") {
      // we have prefix
      this.remotePrefix = k;
    }

    this.containerClient = new ContainerClient(this.config.containerSasUrl);
  }

  async walk(): Promise<Entity[]> {
    const entities: Entity[] = [];
    const realEntities = new Set<string>();
    for await (const blob of this.containerClient.listBlobsFlat({
      prefix: this.remotePrefix,
      includeMetadata: true,
    })) {
      const blockBlobClient = this.containerClient.getBlockBlobClient(
        blob.name
      );
      const props = await blockBlobClient.getProperties();

      // console.debug(blob.name)

      const entity = fromBlobPropsToEntity(blob.name, props, this.remotePrefix);
      entities.push(entity);

      // so we need to fake the folders
      realEntities.add(entity.key!);
      for (const f of getFolderLevels(entity.key!, true)) {
        if (realEntities.has(f)) {
          delete this.synthFoldersCache[f];
          continue;
        }
        if (
          !this.synthFoldersCache.hasOwnProperty(f) ||
          entity.mtimeSvr! >= this.synthFoldersCache[f].mtimeSvr!
        ) {
          this.synthFoldersCache[f] = {
            key: f,
            keyRaw: f,
            size: 0,
            sizeRaw: 0,
            sizeEnc: 0,
            mtimeSvr: entity.mtimeSvr,
            mtimeSvrFmt: entity.mtimeSvrFmt,
            mtimeCli: entity.mtimeCli,
            mtimeCliFmt: entity.mtimeCliFmt,
            synthesizedFolder: true,
          };
        }
      }
    }
    for (const key of Object.keys(this.synthFoldersCache)) {
      entities.push(this.synthFoldersCache[key]);
    }
    return entities;
  }

  async walkPartial(): Promise<Entity[]> {
    const entities: Entity[] = [];
    for await (const blob of this.containerClient.listBlobsByHierarchy("/", {
      prefix: this.remotePrefix,
      includeMetadata: true,
    })) {
      if (blob.kind === "prefix") {
        continue;
      }
      const blockBlobClient = this.containerClient.getBlockBlobClient(
        blob.name
      );
      const props = await blockBlobClient.getProperties();

      const entity = fromBlobPropsToEntity(blob.name, props, this.remotePrefix);
      entities.push(entity);
    }
    return entities;
  }

  async stat(key: string): Promise<Entity> {
    const remotePath = getBlobPath(key, this.remotePrefix);
    const blockBlobClient = this.containerClient.getBlockBlobClient(remotePath);
    const props = await blockBlobClient.getProperties();

    const entity = fromBlobPropsToEntity(remotePath, props, this.remotePrefix);
    return entity;
  }

  async mkdir(
    key: string,
    mtime?: number | undefined,
    ctime?: number | undefined
  ): Promise<Entity> {
    if (!key.endsWith("/")) {
      throw new Error(`You should not call mkdir on ${key}!`);
    }

    const generateFolderObject = this.config.generateFolderObject ?? false;
    if (!generateFolderObject) {
      const synth = {
        key: key,
        keyRaw: key,
        size: 0,
        sizeRaw: 0,
        sizeEnc: 0,
        mtimeSvr: mtime,
        mtimeCli: mtime,
        synthesizedFolder: true,
      };
      this.synthFoldersCache[key] = synth;
      return synth;
    }

    return await this.writeFile(
      key,
      new ArrayBuffer(0),
      mtime ?? Date.now(),
      ctime ?? Date.now()
    );
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    const blobPath = getBlobPath(key, this.remotePrefix);

    const blobClient = this.containerClient.getBlockBlobClient(blobPath);
    const metadata: Record<string, string> = {
      mtime: new Date(mtime).toISOString(),
      ctime: new Date(ctime).toISOString(),
    };

    if (key.endsWith("/")) {
      console.debug(`yeah we have folder upload`);
      const generateFolderObject = this.config.generateFolderObject ?? false;
      if (!generateFolderObject) {
        throw Error(
          `if not generate folder object, the func should not go here`
        );
      }
      metadata["hdi_isfolder"] = "true";
    }

    const uploadResult = await blobClient.uploadData(content, {
      metadata: metadata,
      concurrency: this.config.partsConcurrency ?? 5,
    });

    if (key.endsWith("/")) {
      console.debug(`yeah we have folder upload`);
      console.debug(uploadResult);
    }

    if (uploadResult._response.status >= 300) {
      throw Error(`upload ${key} failed with ${JSON.stringify(uploadResult)}`);
    }

    return await this.stat(key);
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    const blobPath = getBlobPath(key, this.remotePrefix);
    const blobClient = this.containerClient.getBlockBlobClient(blobPath);
    const rsp = await blobClient.download();
    if (rsp._response.status >= 300) {
      throw Error(`download ${key} failed with ${JSON.stringify(rsp)}`);
    }
    return await (await rsp.blobBody)!.arrayBuffer();
  }

  async rename(key1: string, key2: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async rm(key: string): Promise<void> {
    const blobPath = getBlobPath(key, this.remotePrefix);
    if (key.endsWith("/")) {
      if (this.synthFoldersCache.hasOwnProperty(key)) {
        delete this.synthFoldersCache[key];
      }

      // in blob the folder may not exist, so we make our best effort.
      // do NOT read this.config.generateFolderObject
      // because the folder might be generated by previous setting
      try {
        const blobClient = this.containerClient.getBlockBlobClient(blobPath);
        await blobClient.deleteIfExists();
      } catch (e) {}
    } else {
      // the file should really exist
      const blobClient = this.containerClient.getBlockBlobClient(blobPath);
      const rsp = await blobClient.deleteIfExists();
      if (!rsp.succeeded) {
        throw Error(
          `something goes wrong while deleting ${key}: ${JSON.stringify(rsp)}`
        );
      }
    }
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    // if we can walk, we can connect
    try {
      await this.walkPartial();
      return true;
    } catch (err) {
      console.debug(err);
      callbackFunc?.(err);
      return false;
    }
  }

  async getUserDisplayName(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async revokeAuth(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
