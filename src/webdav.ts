import { Buffer } from "buffer";
import { FileStats, Vault } from "obsidian";
import { AuthType, BufferLike, createClient } from "webdav/web";
import type { WebDAVClient, ResponseDataDetailed, FileStat } from "webdav/web";

import {
  arrayBufferToBuffer,
  bufferToArrayBuffer,
  mkdirpInVault,
} from "./misc";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import { fileURLToPath } from "url";

export interface WebdavConfig {
  address: string;
  username: string;
  password: string;
  authType: "digest" | "basic";
}

export const DEFAULT_WEBDAV_CONFIG = {
  address: "",
  username: "",
  password: "",
  authType: "basic",
} as WebdavConfig;

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

export const getRemoteMeta = async (
  client: WebDAVClient,
  fileOrFolderPath: string
) => {
  const res = (await client.stat(getWebdavPath(fileOrFolderPath), {
    details: true,
  })) as ResponseDataDetailed<FileStat>;
  res.data.filename = getNormPath(res.data.filename);
  return res;
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
      client.createDirectory(uploadFile, {
        recursive: true,
      });
      return await getRemoteMeta(client, uploadFile);
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
  for (const singleItem of contents) {
    singleItem.filename = getNormPath(singleItem.filename);
  }
  return {
    Contents: contents,
  };
};

export const downloadFromRemoteRaw = async (
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

export const checkWebdavConnectivity = async (client: WebDAVClient) => {
  try {
    const results = await getRemoteMeta(client, "/");
    if (
      results === undefined ||
      results.data === undefined ||
      results.data.type === undefined ||
      results.data.type !== "directory"
    ) {
      return false;
    }
    return true;
  } catch (err) {
    return false;
  }
};
