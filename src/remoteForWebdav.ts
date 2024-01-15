import { Buffer } from "buffer";
import { Vault, requestUrl } from "obsidian";

import { Queue } from "@fyears/tsqueue";
import chunk from "lodash/chunk";
import flatten from "lodash/flatten";
import { getReasonPhrase } from "http-status-codes";
import { RemoteItem, VALID_REQURL, WebdavConfig } from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import { bufferToArrayBuffer, getPathFolder, mkdirpInVault } from "./misc";

import { log } from "./moreOnLog";

import type {
  FileStat,
  WebDAVClient,
  RequestOptionsWithState,
  // Response,
  // ResponseDataDetailed,
} from "webdav";

/**
 * https://stackoverflow.com/questions/32850898/how-to-check-if-a-string-has-any-non-iso-8859-1-characters-with-javascript
 * @param str
 * @returns true if all are iso 8859 1 chars
 */
function onlyAscii(str: string) {
  return !/[^\u0000-\u00ff]/g.test(str);
}

// @ts-ignore
import { getPatcher } from "webdav/dist/web/index.js";
if (VALID_REQURL) {
  getPatcher().patch(
    "request",
    async (options: RequestOptionsWithState): Promise<Response> => {
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

      let contentType: string | undefined =
        r.headers["Content-Type"] || r.headers["content-type"];
      if (options.headers !== undefined) {
        contentType =
          contentType ||
          options.headers["Content-Type"] ||
          options.headers["content-type"] ||
          options.headers["Accept"] ||
          options.headers["accept"];
      }

      if (contentType !== undefined) {
        contentType = contentType.toLowerCase();
      }
      const rspHeaders = { ...r.headers };
      console.log("rspHeaders");
      console.log(rspHeaders);
      for (let key in rspHeaders) {
        if (rspHeaders.hasOwnProperty(key)) {
          // avoid the error:
          // Failed to read the 'headers' property from 'ResponseInit': String contains non ISO-8859-1 code point.
          // const possibleNonAscii = [
          //   "Content-Disposition",
          //   "X-Accel-Redirect",
          //   "X-Outfilename",
          //   "X-Sendfile"
          // ];
          // for (const p of possibleNonAscii) {
          //   if (key === p || key === p.toLowerCase()) {
          //     rspHeaders[key] = encodeURIComponent(rspHeaders[key]);
          //   }
          // }
          if (!onlyAscii(rspHeaders[key])) {
            rspHeaders[key] = encodeURIComponent(rspHeaders[key]);
          }
        }
      }
      // log.info(`requesting url=${options.url}`);
      // log.info(`contentType=${contentType}`);
      // log.info(`rspHeaders=${JSON.stringify(rspHeaders)}`)

      // let r2: Response = undefined;
      // if (contentType.includes("xml")) {
      //   r2 = new Response(r.text, {
      //     status: r.status,
      //     statusText: getReasonPhrase(r.status),
      //     headers: rspHeaders,
      //   });
      // } else if (
      //   contentType.includes("json") ||
      //   contentType.includes("javascript")
      // ) {
      //   log.info('inside json branch');
      //   // const j = r.json;
      //   // log.info(j);
      //   r2 = new Response(
      //     r.text,  // yea, here is the text because Response constructor expects a text
      //     {
      //     status: r.status,
      //     statusText: getReasonPhrase(r.status),
      //     headers: rspHeaders,
      //   });
      // } else if (contentType.includes("text")) {
      //   // avoid text/json,
      //   // so we split this out from the above xml or json branch
      //   r2 = new Response(r.text, {
      //     status: r.status,
      //     statusText: getReasonPhrase(r.status),
      //     headers: rspHeaders,
      //   });
      // } else if (
      //   contentType.includes("octet-stream") ||
      //   contentType.includes("binary") ||
      //   contentType.includes("buffer")
      // ) {
      //   // application/octet-stream
      //   r2 = new Response(r.arrayBuffer, {
      //     status: r.status,
      //     statusText: getReasonPhrase(r.status),
      //     headers: rspHeaders,
      //   });
      // } else {
      //   throw Error(
      //     `do not know how to deal with requested content type = ${contentType}`
      //   );
      // }

      let r2: Response | undefined = undefined;
      if ([101, 103, 204, 205, 304].includes(r.status)) {
        // A null body status is a status that is 101, 103, 204, 205, or 304.
        // https://fetch.spec.whatwg.org/#statuses
        // fix this: Failed to construct 'Response': Response with null body status cannot have body
        r2 = new Response(null, {
          status: r.status,
          statusText: getReasonPhrase(r.status),
          headers: rspHeaders,
        });
      } else {
        r2 = new Response(r.arrayBuffer, {
          status: r.status,
          statusText: getReasonPhrase(r.status),
          headers: rspHeaders,
        });
      }

      return r2;
    }
  );
}

// @ts-ignore
import { AuthType, BufferLike, createClient } from "webdav/dist/web/index.js";
export type { WebDAVClient } from "webdav";

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
  } else if (fileOrFolderPath.startsWith("/")) {
    log.warn(
      `why the path ${fileOrFolderPath} starts with '/'? but we just go on.`
    );
    key = `/${remoteBaseDir}${fileOrFolderPath}`;
  } else {
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
  client!: WebDAVClient;
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
    const headers = {
      "Cache-Control": "no-cache",
    };
    if (this.client === undefined) {
      if (
        this.webdavConfig.username !== "" &&
        this.webdavConfig.password !== ""
      ) {
        this.client = createClient(this.webdavConfig.address, {
          username: this.webdavConfig.username,
          password: this.webdavConfig.password,
          headers: headers,
          authType:
            this.webdavConfig.authType === "digest"
              ? AuthType.Digest
              : AuthType.Password,
        });
      } else {
        log.info("no password");
        this.client = createClient(this.webdavConfig.address, {
          headers: headers,
        });
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
            Accept: "text/plain,application/xml",
          },
          // responseType: "text",
        } as any);
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
                Accept: "text/plain,application/xml",
              },
              // responseType: "text",
            } as any
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

/**
 *
 * @param client
 * @param remotePath It should be prefix-ed already
 * @returns
 */
export const getRemoteMeta = async (
  client: WrappedWebdavClient,
  remotePath: string
) => {
  await client.init();
  log.debug(`getRemoteMeta remotePath = ${remotePath}`);
  const res = (await client.client.stat(remotePath, {
    details: false,
  })) as FileStat;
  log.debug(`getRemoteMeta res=${JSON.stringify(res)}`);
  return fromWebdavItemToRemoteItem(res, client.remoteBaseDir);
};

export const uploadToRemote = async (
  client: WrappedWebdavClient,
  fileOrFolderPath: string,
  vault: Vault | undefined,
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
      if (vault == undefined) {
        throw new Error(
          `the vault variable is not passed but we want to read ${fileOrFolderPath} for webdav`
        );
      }
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

export const listAllFromRemote = async (client: WrappedWebdavClient) => {
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
      const itemsToFetch: string[] = [];
      while (q.length > 0) {
        itemsToFetch.push(q.pop()!);
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
  remotePath: string
) => {
  await client.init();
  // log.info(`getWebdavPath=${remotePath}`);
  const buff = (await client.client.getFileContents(remotePath)) as BufferLike;
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
    // log.info(`downloadFile=${downloadFile}`);
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
    log.error("some error while deleting");
    log.error(err);
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
    log.error(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
  try {
    await client.init();
    const results = await getRemoteMeta(client, `/${client.remoteBaseDir}`);
    if (results === undefined) {
      const err = "results is undefined";
      log.error(err);
      if (callbackFunc !== undefined) {
        callbackFunc(err);
      }
      return false;
    }
    return true;
  } catch (err) {
    log.error(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
};
