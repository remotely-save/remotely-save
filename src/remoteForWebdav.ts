import { Buffer } from "buffer";
import { Vault } from "obsidian";
import type { FileStat, WebDAVClient } from "webdav/web";
import { AuthType, BufferLike, createClient } from "webdav/web";
import { Queue } from "@fyears/tsqueue";
import chunk from "lodash/chunk";
import flatten from "lodash/flatten";
import type { RemoteItem, WebdavConfig } from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import { bufferToArrayBuffer, getPathFolder, mkdirpInVault } from "./misc";
export type { WebDAVClient } from "webdav/web";

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

export const DEFAULT_WEBDAV_CONFIG = {
  address: "",
  username: "",
  password: "",
  authType: "basic",
  manualRecursive: false,
} as WebdavConfig;

const getWebdavPath = (fileOrFolderPath: string, vaultName: string) => {
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = `/${vaultName}/`;
  }
  if (!fileOrFolderPath.startsWith("/")) {
    key = `/${vaultName}/${fileOrFolderPath}`;
  }
  return key;
};

const getNormPath = (fileOrFolderPath: string, vaultName: string) => {
  if (
    !(
      fileOrFolderPath === `/${vaultName}` ||
      fileOrFolderPath.startsWith(`/${vaultName}/`)
    )
  ) {
    throw Error(`"${fileOrFolderPath}" doesn't starts with "/${vaultName}/"`);
  }
  // if (fileOrFolderPath.startsWith("/")) {
  //   return fileOrFolderPath.slice(1);
  // }
  return fileOrFolderPath.slice(`/${vaultName}/`.length);
};

const fromWebdavItemToRemoteItem = (x: FileStat, vaultName: string) => {
  let key = getNormPath(x.filename, vaultName);
  if (x.type === "directory" && !key.endsWith("/")) {
    key = `${key}/`;
  }
  return {
    key: key,
    lastModified: Date.parse(x.lastmod).valueOf(),
    size: x.size,
    remoteType: "webdav",
    etag: x.etag || undefined,
  } as RemoteItem;
};

export class WrappedWebdavClient {
  webdavConfig: WebdavConfig;
  vaultName: string;
  client: WebDAVClient;
  vaultFolderExists: boolean;
  constructor(webdavConfig: WebdavConfig, vaultName: string) {
    this.webdavConfig = webdavConfig;
    this.vaultName = vaultName;
    this.vaultFolderExists = false;
  }

  init = async () => {
    // init client if not inited
    if (this.client === undefined) {
      if (
        this.webdavConfig.username !== "" &&
        this.webdavConfig.password !== ""
      ) {
        this.client = createClient(this.webdavConfig.address, {
          username: this.webdavConfig.username,
          password: this.webdavConfig.password,
          authType:
            this.webdavConfig.authType === "digest"
              ? AuthType.Digest
              : AuthType.Password,
        });
      } else {
        log.info("no password");
        this.client = createClient(this.webdavConfig.address);
      }
    }

    // check vault folder
    if (this.vaultFolderExists) {
      // pass
    } else {
      const res = await this.client.exists(`/${this.vaultName}`);
      if (res) {
        // log.info("remote vault folder exits!");
        this.vaultFolderExists = true;
      } else {
        log.info("remote vault folder not exists, creating");
        await this.client.createDirectory(`/${this.vaultName}`);
        log.info("remote vault folder created!");
        this.vaultFolderExists = true;
      }
    }
  };
}

export const getWebdavClient = (
  webdavConfig: WebdavConfig,
  vaultName: string
) => {
  return new WrappedWebdavClient(webdavConfig, vaultName);
};

export const getRemoteMeta = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const remotePath = getWebdavPath(fileOrFolderPath, client.vaultName);
  // log.info(`remotePath = ${remotePath}`);
  const res = (await client.client.stat(remotePath, {
    details: false,
  })) as FileStat;
  return fromWebdavItemToRemoteItem(res, client.vaultName);
};

export const uploadToRemote = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string,
  vault: Vault,
  isRecursively: boolean = false,
  password: string = "",
  remoteEncryptedKey: string = "",
  uploadRaw: boolean = false,
  rawContent: string | ArrayBuffer = ""
) => {
  await client.init();
  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    uploadFile = remoteEncryptedKey;
  }
  uploadFile = getWebdavPath(uploadFile, client.vaultName);

  const isFolder = fileOrFolderPath.endsWith("/");

  if (isFolder && isRecursively) {
    throw Error("upload function doesn't implement recursive function yet!");
  } else if (isFolder && !isRecursively) {
    if (uploadRaw) {
      throw Error(`you specify uploadRaw, but you also provide a folder key!`);
    }
    // folder
    if (password === "") {
      // if not encrypted, mkdir a remote folder
      await client.client.createDirectory(uploadFile, {
        recursive: true,
      });
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    } else {
      // if encrypted, upload a fake file with the encrypted file name
      await client.client.putFileContents(uploadFile, "", {
        overwrite: true,
        onUploadProgress: (progress) => {
          // log.info(`Uploaded ${progress.loaded} bytes of ${progress.total}`);
        },
      });

      return await getRemoteMeta(client, uploadFile);
    }
  } else {
    // file
    // we ignore isRecursively parameter here
    let localContent = undefined;
    if (uploadRaw) {
      if (typeof rawContent === "string") {
        localContent = new TextEncoder().encode(rawContent).buffer;
      } else {
        localContent = rawContent;
      }
    } else {
      localContent = await vault.adapter.readBinary(fileOrFolderPath);
    }
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }
    // we need to create folders before uploading
    const dir = getPathFolder(uploadFile);
    if (dir !== "/" && dir !== "") {
      await client.client.createDirectory(dir, { recursive: true });
    }
    await client.client.putFileContents(uploadFile, remoteContent, {
      overwrite: true,
      onUploadProgress: (progress) => {
        log.info(`Uploaded ${progress.loaded} bytes of ${progress.total}`);
      },
    });

    return await getRemoteMeta(client, uploadFile);
  }
};

export const listFromRemote = async (
  client: WrappedWebdavClient,
  prefix?: string
) => {
  if (prefix !== undefined) {
    throw Error("prefix not supported");
  }
  await client.init();

  let contents = [] as FileStat[];
  if (client.webdavConfig.manualRecursive) {
    // the remote doesn't support infinity propfind,
    // we need to do a bfs here
    const q = new Queue([`/${client.vaultName}`]);
    const CHUNK_SIZE = 10;
    while (q.length > 0) {
      const itemsToFetch = [];
      while (q.length > 0) {
        itemsToFetch.push(q.pop());
      }
      const itemsToFetchChunks = chunk(itemsToFetch, CHUNK_SIZE);
      // log.debug(itemsToFetchChunks);
      const subContents = [] as FileStat[];
      for (const singleChunk of itemsToFetchChunks) {
        const r = singleChunk.map((x) => {
          return client.client.getDirectoryContents(x, {
            deep: false,
            details: false /* no need for verbose details here */,
            glob: "/**" /* avoid dot files by using glob */,
          }) as Promise<FileStat[]>;
        });
        const r2 = flatten(await Promise.all(r));
        subContents.push(...r2);
      }
      for (let i = 0; i < subContents.length; ++i) {
        const f = subContents[i];
        contents.push(f);
        if (f.type === "directory") {
          q.push(f.filename);
        }
      }
    }
  } else {
    // the remote supports infinity propfind
    contents = (await client.client.getDirectoryContents(
      `/${client.vaultName}`,
      {
        deep: true,
        details: false /* no need for verbose details here */,
        glob: "/**" /* avoid dot files by using glob */,
      }
    )) as FileStat[];
  }
  return {
    Contents: contents.map((x) =>
      fromWebdavItemToRemoteItem(x, client.vaultName)
    ),
  };
};

const downloadFromRemoteRaw = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const buff = (await client.client.getFileContents(
    getWebdavPath(fileOrFolderPath, client.vaultName)
  )) as BufferLike;
  if (buff instanceof ArrayBuffer) {
    return buff;
  } else if (buff instanceof Buffer) {
    return bufferToArrayBuffer(buff);
  }
  throw Error(`unexpected file content result with type ${typeof buff}`);
};

export const downloadFromRemote = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string,
  vault: Vault,
  mtime: number,
  password: string = "",
  remoteEncryptedKey: string = "",
  skipSaving: boolean = false
) => {
  await client.init();

  const isFolder = fileOrFolderPath.endsWith("/");

  if (!skipSaving) {
    await mkdirpInVault(fileOrFolderPath, vault);
  }

  // the file is always local file
  // we need to encrypt it

  if (isFolder) {
    // mkdirp locally is enough
    // do nothing here
    return new ArrayBuffer(0);
  } else {
    let downloadFile = fileOrFolderPath;
    if (password !== "") {
      downloadFile = remoteEncryptedKey;
    }
    downloadFile = getWebdavPath(downloadFile, client.vaultName);
    const remoteContent = await downloadFromRemoteRaw(client, downloadFile);
    let localContent = remoteContent;
    if (password !== "") {
      localContent = await decryptArrayBuffer(remoteContent, password);
    }
    if (!skipSaving) {
      await vault.adapter.writeBinary(fileOrFolderPath, localContent, {
        mtime: mtime,
      });
    }
    return localContent;
  }
};

export const deleteFromRemote = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string,
  password: string = "",
  remoteEncryptedKey: string = ""
) => {
  if (fileOrFolderPath === "/") {
    return;
  }
  let remoteFileName = fileOrFolderPath;
  if (password !== "") {
    remoteFileName = remoteEncryptedKey;
  }
  remoteFileName = getWebdavPath(remoteFileName, client.vaultName);

  await client.init();
  try {
    await client.client.deleteFile(remoteFileName);
    // log.info(`delete ${remoteFileName} succeeded`);
  } catch (err) {
    console.error("some error while deleting");
    log.info(err);
  }
};

export const checkConnectivity = async (client: WrappedWebdavClient) => {
  try {
    await client.init();
    const results = await getRemoteMeta(client, "/");
    if (results === undefined) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
};
