import { Buffer } from "buffer";
import { Vault, requestUrl } from "obsidian";

import { Queue } from "@fyears/tsqueue";
import chunk from "lodash/chunk";
import flatten from "lodash/flatten";
import { getReasonPhrase } from "http-status-codes";
import { RemoteItem, VALID_REQURL, WebdavConfig } from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import { bufferToArrayBuffer, getPathFolder, mkdirpInVault } from "./misc";

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

import type {
  FileStat,
  WebDAVClient,
  RequestOptionsWithState,
  Response,
  ResponseDataDetailed,
} from "webdav/web";
import { getPatcher } from "webdav/web";
if (VALID_REQURL) {
  getPatcher().patch(
    "request",
    async (
      options: RequestOptionsWithState
    ): Promise<Response | ResponseDataDetailed<any>> => {
      const transformedHeaders = { ...options.headers };
      delete transformedHeaders["host"];
      delete transformedHeaders["Host"];
      delete transformedHeaders["content-length"];
      delete transformedHeaders["Content-Length"];
      const r = await requestUrl({
        url: options.url,
        method: options.method,
        body: options.data as string | ArrayBuffer,
        headers: transformedHeaders,
      });

      let r2: Response | ResponseDataDetailed<any> = undefined;
      if (options.responseType === undefined) {
        r2 = {
          data: undefined,
          status: r.status,
          statusText: getReasonPhrase(r.status),
          headers: r.headers,
        };
      } else if (options.responseType === "json") {
        r2 = {
          data: r.json,
          status: r.status,
          statusText: getReasonPhrase(r.status),
          headers: r.headers,
        };
      } else if (options.responseType === "text") {
        r2 = {
          data: r.text,
          status: r.status,
          statusText: getReasonPhrase(r.status),
          headers: r.headers,
        };
      } else if (options.responseType === "arraybuffer") {
        r2 = {
          data: r.arrayBuffer,
          status: r.status,
          statusText: getReasonPhrase(r.status),
          headers: r.headers,
        };
      } else {
        throw Error(
          `do not know how to deal with responseType = ${options.responseType}`
        );
      }
      return r2;
    }
  );
}
// getPatcher().patch("request", (options: any) => {
//   // console.log("using fetch");
//   const r = fetch(options.url, {
//     method: options.method,
//     body: options.data as any,
//     headers: options.headers,
//     signal: options.signal,
//   })
//     .then((rsp) => {
//       if (options.responseType === undefined) {
//         return Promise.all([undefined, rsp]);
//       }
//       if (options.responseType === "json") {
//         return Promise.all([rsp.json(), rsp]);
//       }
//       if (options.responseType === "text") {
//         return Promise.all([rsp.text(), rsp]);
//       }
//       if (options.responseType === "arraybuffer") {
//         return Promise.all([rsp.arrayBuffer(), rsp]);
//       }
//     })
//     .then(([d, r]) => {
//       return {
//         data: d,
//         status: r.status,
//         statusText: r.statusText,
//         headers: r.headers,
//       };
//     });
//   // console.log("using fetch");
//   return r;
// });
import { AuthType, BufferLike, createClient } from "webdav/web";
export type { WebDAVClient } from "webdav/web";

export const DEFAULT_WEBDAV_CONFIG = {
  address: "",
  username: "",
  password: "",
  authType: "basic",
  manualRecursive: false,
  depth: "auto_unknown",
  remoteBaseDir: "",
} as WebdavConfig;

const getWebdavPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = `/${remoteBaseDir}/`;
  }
  if (!fileOrFolderPath.startsWith("/")) {
    key = `/${remoteBaseDir}/${fileOrFolderPath}`;
  }
  return key;
};

const getNormPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  if (
    !(
      fileOrFolderPath === `/${remoteBaseDir}` ||
      fileOrFolderPath.startsWith(`/${remoteBaseDir}/`)
    )
  ) {
    throw Error(
      `"${fileOrFolderPath}" doesn't starts with "/${remoteBaseDir}/"`
    );
  }
  // if (fileOrFolderPath.startsWith("/")) {
  //   return fileOrFolderPath.slice(1);
  // }
  return fileOrFolderPath.slice(`/${remoteBaseDir}/`.length);
};

const fromWebdavItemToRemoteItem = (x: FileStat, remoteBaseDir: string) => {
  let key = getNormPath(x.filename, remoteBaseDir);
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
  remoteBaseDir: string;
  client: WebDAVClient;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;
  constructor(
    webdavConfig: WebdavConfig,
    remoteBaseDir: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    this.webdavConfig = webdavConfig;
    this.remoteBaseDir = remoteBaseDir;
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
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
      const res = await this.client.exists(`/${this.remoteBaseDir}/`);
      if (res) {
        // log.info("remote vault folder exits!");
        this.vaultFolderExists = true;
      } else {
        log.info("remote vault folder not exists, creating");
        await this.client.createDirectory(`/${this.remoteBaseDir}/`);
        log.info("remote vault folder created!");
        this.vaultFolderExists = true;
      }
    }

    // adjust depth parameter
    if (this.webdavConfig.depth === "auto_unknown") {
      let testPassed = false;
      try {
        const res = await this.client.customRequest(`/${this.remoteBaseDir}/`, {
          method: "PROPFIND",
          headers: {
            Depth: "infinity",
          },
          responseType: "text",
        });
        if (res.status === 403) {
          throw Error("not support Infinity, get 403");
        } else {
          testPassed = true;
          this.webdavConfig.depth = "auto_infinity";
          this.webdavConfig.manualRecursive = false;
        }
      } catch (error) {
        testPassed = false;
      }
      if (!testPassed) {
        try {
          const res = await this.client.customRequest(
            `/${this.remoteBaseDir}/`,
            {
              method: "PROPFIND",
              headers: {
                Depth: "1",
              },
              responseType: "text",
            }
          );
          testPassed = true;
          this.webdavConfig.depth = "auto_1";
          this.webdavConfig.manualRecursive = true;
        } catch (error) {
          testPassed = false;
        }
      }
      if (testPassed) {
        // the depth option has been changed
        // save the setting
        if (this.saveUpdatedConfigFunc !== undefined) {
          await this.saveUpdatedConfigFunc();
          log.info(
            `webdav depth="auto_unknown" is changed to ${this.webdavConfig.depth}`
          );
        }
      }
    }
  };
}

export const getWebdavClient = (
  webdavConfig: WebdavConfig,
  remoteBaseDir: string,
  saveUpdatedConfigFunc: () => Promise<any>
) => {
  return new WrappedWebdavClient(
    webdavConfig,
    remoteBaseDir,
    saveUpdatedConfigFunc
  );
};

export const getRemoteMeta = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const remotePath = getWebdavPath(fileOrFolderPath, client.remoteBaseDir);
  // log.info(`remotePath = ${remotePath}`);
  const res = (await client.client.stat(remotePath, {
    details: false,
  })) as FileStat;
  return fromWebdavItemToRemoteItem(res, client.remoteBaseDir);
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
  uploadFile = getWebdavPath(uploadFile, client.remoteBaseDir);

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
        recursive: false, // the sync algo should guarantee no need to recursive
      });
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    } else {
      // if encrypted, upload a fake file with the encrypted file name
      await client.client.putFileContents(uploadFile, "", {
        overwrite: true,
        onUploadProgress: (progress: any) => {
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
    // updated 20220326: the algorithm guarantee this
    // // we need to create folders before uploading
    // const dir = getPathFolder(uploadFile);
    // if (dir !== "/" && dir !== "") {
    //   await client.client.createDirectory(dir, { recursive: false });
    // }
    await client.client.putFileContents(uploadFile, remoteContent, {
      overwrite: true,
      onUploadProgress: (progress: any) => {
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
  if (
    client.webdavConfig.depth === "auto_1" ||
    client.webdavConfig.depth === "manual_1"
  ) {
    // the remote doesn't support infinity propfind,
    // we need to do a bfs here
    const q = new Queue([`/${client.remoteBaseDir}`]);
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
            // TODO: to support .obsidian,
            // we need to load all files including dot,
            // anyway to reduce the resources?
            // glob: "/**" /* avoid dot files by using glob */,
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
      `/${client.remoteBaseDir}`,
      {
        deep: true,
        details: false /* no need for verbose details here */,
        // TODO: to support .obsidian,
        // we need to load all files including dot,
        // anyway to reduce the resources?
        // glob: "/**" /* avoid dot files by using glob */,
      }
    )) as FileStat[];
  }
  return {
    Contents: contents.map((x) =>
      fromWebdavItemToRemoteItem(x, client.remoteBaseDir)
    ),
  };
};

const downloadFromRemoteRaw = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const buff = (await client.client.getFileContents(
    getWebdavPath(fileOrFolderPath, client.remoteBaseDir)
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
    downloadFile = getWebdavPath(downloadFile, client.remoteBaseDir);
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
  remoteFileName = getWebdavPath(remoteFileName, client.remoteBaseDir);

  await client.init();
  try {
    await client.client.deleteFile(remoteFileName);
    // log.info(`delete ${remoteFileName} succeeded`);
  } catch (err) {
    console.error("some error while deleting");
    log.info(err);
  }
};

export const checkConnectivity = async (
  client: WrappedWebdavClient,
  callbackFunc?: any
) => {
  if (
    !(
      client.webdavConfig.address.startsWith("http://") ||
      client.webdavConfig.address.startsWith("https://")
    )
  ) {
    const err = "Error: the url should start with http(s):// but it does not!";
    log.debug(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
  try {
    await client.init();
    const results = await getRemoteMeta(client, "/");
    if (results === undefined) {
      const err = "results is undefined";
      log.debug(err);
      if (callbackFunc !== undefined) {
        callbackFunc(err);
      }
      return false;
    }
    return true;
  } catch (err) {
    log.debug(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
};
