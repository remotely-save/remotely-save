import { Buffer } from "buffer";
import { FileStats, Vault } from "obsidian";
import { AuthType, BufferLike, createClient } from "webdav/web";
import type { WebDAVClient, ResponseDataDetailed, FileStat } from "webdav/web";
export type { WebDAVClient } from "webdav/web";

import type { RemoteItem } from "./baseTypes";

import {
  arrayBufferToBuffer,
  bufferToArrayBuffer,
  mkdirpInVault,
  getPathFolder,
} from "./misc";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";

export type WebdavAuthType = "digest" | "basic";

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: WebdavAuthType;
}

export const DEFAULT_WEBDAV_CONFIG = {
  address: "",
  username: "",
  password: "",
  authType: "basic",
} as WebdavConfig;

const getWebdavPath = (fileOrFolderPath: string) => {
  if (!fileOrFolderPath.startsWith("/")) {
    return `/${fileOrFolderPath}`;
  }
  return fileOrFolderPath;
};

const getNormPath = (fileOrFolderPath: string) => {
  if (fileOrFolderPath.startsWith("/")) {
    return fileOrFolderPath.slice(1);
  }
  return fileOrFolderPath;
};

const fromWebdavItemToRemoteItem = (x: FileStat) => {
  let key = getNormPath(x.filename);
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

export const getWebdavClient = (webdavConfig: WebdavConfig) => {
  if (webdavConfig.username !== "" && webdavConfig.password !== "") {
    return createClient(webdavConfig.address, {
      username: webdavConfig.username,
      password: webdavConfig.password,
      authType:
        webdavConfig.authType === "digest"
          ? AuthType.Digest
          : AuthType.Password,
    });
  } else {
    console.log("no password");
    return createClient(webdavConfig.address);
  }
};

export const getRemoteMeta = async (
  client: WebDAVClient,
  fileOrFolderPath: string
) => {
  const res = (await client.stat(getWebdavPath(fileOrFolderPath), {
    details: false,
  })) as FileStat;
  return fromWebdavItemToRemoteItem(res);
};

export const uploadToRemote = async (
  client: WebDAVClient,
  fileOrFolderPath: string,
  vault: Vault,
  isRecursively: boolean = false,
  password: string = "",
  remoteEncryptedKey: string = ""
) => {
  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    uploadFile = remoteEncryptedKey;
  }
  uploadFile = getWebdavPath(uploadFile);

  const isFolder = fileOrFolderPath.endsWith("/");

  if (isFolder && isRecursively) {
    throw Error("upload function doesn't implement recursive function yet!");
  } else if (isFolder && !isRecursively) {
    // folder
    if (password === "") {
      // if not encrypted, mkdir a remote folder
      await client.createDirectory(uploadFile, {
        recursive: true,
      });
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    } else {
      // if encrypted, upload a fake file with the encrypted file name
      await client.putFileContents(uploadFile, "", {
        overwrite: true,
        onUploadProgress: (progress) => {
          console.log(`Uploaded ${progress.loaded} bytes of ${progress.total}`);
        },
      });

      return await getRemoteMeta(client, uploadFile);
    }
  } else {
    // file
    // we ignore isRecursively parameter here
    const localContent = await vault.adapter.readBinary(fileOrFolderPath);
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }
    // we need to create folders before uploading
    const dir = getPathFolder(uploadFile);
    if (dir !== "/" && dir !== "") {
      await client.createDirectory(dir, { recursive: true });
    }
    await client.putFileContents(uploadFile, remoteContent, {
      overwrite: true,
      onUploadProgress: (progress) => {
        console.log(`Uploaded ${progress.loaded} bytes of ${progress.total}`);
      },
    });

    return await getRemoteMeta(client, uploadFile);
  }
};

export const listFromRemote = async (client: WebDAVClient, prefix?: string) => {
  if (prefix !== undefined) {
    throw Error("prefix not supported");
  }
  const contents = (await client.getDirectoryContents("/", {
    deep: true,
    details: false /* no need for verbose details here */,
    glob: "/**" /* avoid dot files by using glob */,
  })) as FileStat[];
  return {
    Contents: contents.map((x) => fromWebdavItemToRemoteItem(x)),
  };
};

const downloadFromRemoteRaw = async (
  client: WebDAVClient,
  fileOrFolderPath: string
) => {
  const buff = (await client.getFileContents(
    getWebdavPath(fileOrFolderPath)
  )) as BufferLike;
  if (buff instanceof ArrayBuffer) {
    return buff;
  } else if (buff instanceof Buffer) {
    return bufferToArrayBuffer(buff);
  }
  throw Error(`unexpected file content result with type ${typeof buff}`);
};

export const downloadFromRemote = async (
  client: WebDAVClient,
  fileOrFolderPath: string,
  vault: Vault,
  mtime: number,
  password: string = "",
  remoteEncryptedKey: string = ""
) => {
  const isFolder = fileOrFolderPath.endsWith("/");

  await mkdirpInVault(fileOrFolderPath, vault);

  // the file is always local file
  // we need to encrypt it

  if (isFolder) {
    // mkdirp locally is enough
    // do nothing here
  } else {
    let downloadFile = fileOrFolderPath;
    if (password !== "") {
      downloadFile = remoteEncryptedKey;
    }
    downloadFile = getWebdavPath(downloadFile);
    const remoteContent = await downloadFromRemoteRaw(client, downloadFile);
    let localContent = remoteContent;
    if (password !== "") {
      localContent = await decryptArrayBuffer(remoteContent, password);
    }
    await vault.adapter.writeBinary(fileOrFolderPath, localContent, {
      mtime: mtime,
    });
  }
};

export const deleteFromRemote = async (
  client: WebDAVClient,
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
  remoteFileName = getWebdavPath(remoteFileName);
  try {
    await client.deleteFile(remoteFileName);
    console.log(`delete ${remoteFileName} succeeded`);
  } catch (err) {
    console.error("some error while deleting");
    console.log(err);
  }
};

export const checkConnectivity = async (client: WebDAVClient) => {
  try {
    const results = await getRemoteMeta(client, "/");
    if (results === undefined) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
};
