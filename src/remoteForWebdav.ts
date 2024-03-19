import { Buffer } from "buffer";
import { Vault, requestUrl } from "obsidian";

import { Queue } from "@fyears/tsqueue";
import chunk from "lodash/chunk";
import flatten from "lodash/flatten";
import { getReasonPhrase } from "http-status-codes";
import { Entity, UploadedType, VALID_REQURL, WebdavConfig } from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import { bufferToArrayBuffer, getPathFolder, mkdirpInVault } from "./misc";

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

/**
 * https://stackoverflow.com/questions/12539574/
 * @param obj
 * @returns
 */
function objKeyToLower(obj: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])
  );
}

// @ts-ignore
import { getPatcher } from "webdav/dist/web/index.js";
if (VALID_REQURL) {
  getPatcher().patch(
    "request",
    async (options: RequestOptionsWithState): Promise<Response> => {
      const transformedHeaders = objKeyToLower({ ...options.headers });
      delete transformedHeaders["host"];
      delete transformedHeaders["content-length"];

      console.debug(`before request:`);
      console.debug(`url: ${options.url}`);
      console.debug(`method: ${options.method}`);
      console.debug(`headers: ${JSON.stringify(transformedHeaders, null, 2)}`);

      const r = await requestUrl({
        url: options.url,
        method: options.method,
        body: options.data as string | ArrayBuffer,
        headers: transformedHeaders,
        throw: false,
      });

      let contentType: string | undefined =
        r.headers["Content-Type"] || r.headers["content-type"];
      if (options.headers !== undefined) {
        contentType =
          contentType ||
          transformedHeaders["content-type"] ||
          transformedHeaders["accept"];
      }
      if (contentType !== undefined) {
        contentType = contentType.toLowerCase();
      }

      console.debug(`after request:`);
      console.debug(`contentType: ${contentType}`);

      const rspHeaders = objKeyToLower({ ...r.headers });
      console.debug(`rspHeaders: ${JSON.stringify(rspHeaders, null, 2)}`);
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
            console.debug(`rspHeaders[key] needs encode: ${key}`);
            rspHeaders[key] = encodeURIComponent(rspHeaders[key]);
          }
        }
      }
      // console.info(`requesting url=${options.url}`);
      // console.info(`contentType=${contentType}`);
      // console.info(`rspHeaders=${JSON.stringify(rspHeaders)}`)

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
      //   console.info('inside json branch');
      //   // const j = r.json;
      //   // console.info(j);
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
      const statusText = getReasonPhrase(r.status);
      console.debug(`statusText: ${statusText}`);
      if ([101, 103, 204, 205, 304].includes(r.status)) {
        // A null body status is a status that is 101, 103, 204, 205, or 304.
        // https://fetch.spec.whatwg.org/#statuses
        // fix this: Failed to construct 'Response': Response with null body status cannot have body
        r2 = new Response(null, {
          status: r.status,
          statusText: statusText,
          headers: rspHeaders,
        });
      } else {
        r2 = new Response(r.arrayBuffer, {
          status: r.status,
          statusText: statusText,
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
  manualRecursive: true,
  depth: "manual_1",
  remoteBaseDir: "",
} as WebdavConfig;

const getWebdavPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = `/${remoteBaseDir}/`;
  } else if (fileOrFolderPath.startsWith("/")) {
    console.warn(
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

const fromWebdavItemToEntity = (x: FileStat, remoteBaseDir: string) => {
  let key = getNormPath(x.filename, remoteBaseDir);
  if (x.type === "directory" && !key.endsWith("/")) {
    key = `${key}/`;
  }
  const mtimeSvr = Date.parse(x.lastmod).valueOf();
  return {
    keyRaw: key,
    mtimeSvr: mtimeSvr,
    mtimeCli: mtimeSvr, // no universal way to set mtime in webdav
    sizeRaw: x.size,
    etag: x.etag,
  } as Entity;
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
    if (this.client !== undefined) {
      return;
    }
    const headers = {
      "Cache-Control": "no-cache",
    };
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
      console.info("no password");
      this.client = createClient(this.webdavConfig.address, {
        headers: headers,
      });
    }

    // check vault folder
    if (this.vaultFolderExists) {
      // pass
    } else {
      const res = await this.client.exists(`/${this.remoteBaseDir}/`);
      if (res) {
        // console.info("remote vault folder exits!");
        this.vaultFolderExists = true;
      } else {
        console.info("remote vault folder not exists, creating");
        await this.client.createDirectory(`/${this.remoteBaseDir}/`);
        console.info("remote vault folder created!");
        this.vaultFolderExists = true;
      }
    }

    // adjust depth parameter
    if (
      this.webdavConfig.depth === "auto" ||
      this.webdavConfig.depth === "auto_1" ||
      this.webdavConfig.depth === "auto_infinity" ||
      this.webdavConfig.depth === "auto_unknown"
    ) {
      this.webdavConfig.depth = "manual_1";
      this.webdavConfig.manualRecursive = true;
      if (this.saveUpdatedConfigFunc !== undefined) {
        await this.saveUpdatedConfigFunc();
        console.info(
          `webdav depth="auto_???" is changed to ${this.webdavConfig.depth}`
        );
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
  console.debug(`getRemoteMeta remotePath = ${remotePath}`);
  const res = (await client.client.stat(remotePath, {
    details: false,
  })) as FileStat;
  console.debug(`getRemoteMeta res=${JSON.stringify(res)}`);
  return fromWebdavItemToEntity(res, client.remoteBaseDir);
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
): Promise<UploadedType> => {
  await client.init();
  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    if (remoteEncryptedKey === undefined || remoteEncryptedKey === "") {
      throw Error(
        `uploadToRemote(webdav) you have password but remoteEncryptedKey is empty!`
      );
    }
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
        recursive: true,
      });
      const res = await getRemoteMeta(client, uploadFile);
      return {
        entity: res,
      };
    } else {
      // if encrypted, upload a fake file with the encrypted file name
      await client.client.putFileContents(uploadFile, "", {
        overwrite: true,
        onUploadProgress: (progress: any) => {
          // console.info(`Uploaded ${progress.loaded} bytes of ${progress.total}`);
        },
      });

      return {
        entity: await getRemoteMeta(client, uploadFile),
      };
    }
  } else {
    // file
    // we ignore isRecursively parameter here
    let localContent: ArrayBuffer | undefined = undefined;
    let mtimeCli: number | undefined = undefined;
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
      mtimeCli = (await vault.adapter.stat(fileOrFolderPath))?.mtime;
    }
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }
    // updated 20220326: the algorithm guarantee this
    // // we need to create folders before uploading
    // const dir = getPathFolder(uploadFile);
    // if (dir !== "/" && dir !== "") {
    //   await client.client.createDirectory(dir, { recursive: true });
    // }
    await client.client.putFileContents(uploadFile, remoteContent, {
      overwrite: true,
      onUploadProgress: (progress: any) => {
        console.info(`Uploaded ${progress.loaded} bytes of ${progress.total}`);
      },
    });

    return {
      entity: await getRemoteMeta(client, uploadFile),
      mtimeCli: mtimeCli,
    };
  }
};

export const listAllFromRemote = async (client: WrappedWebdavClient) => {
  await client.init();

  let contents = [] as FileStat[];
  if (
    client.webdavConfig.depth === "auto" ||
    client.webdavConfig.depth === "auto_unknown" ||
    client.webdavConfig.depth === "auto_1" ||
    client.webdavConfig.depth === "auto_infinity" /* don't trust auto now */ ||
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
      // console.debug(itemsToFetchChunks);
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
  return contents.map((x) => fromWebdavItemToEntity(x, client.remoteBaseDir));
};

const downloadFromRemoteRaw = async (
  client: WrappedWebdavClient,
  remotePath: string
) => {
  await client.init();
  // console.info(`getWebdavPath=${remotePath}`);
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
    // console.info(`downloadFile=${downloadFile}`);
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
    // console.info(`delete ${remoteFileName} succeeded`);
  } catch (err) {
    console.error("some error while deleting");
    console.error(err);
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
    console.error(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
  try {
    await client.init();
    const results = await getRemoteMeta(client, `/${client.remoteBaseDir}/`);
    if (results === undefined) {
      const err = "results is undefined";
      console.error(err);
      if (callbackFunc !== undefined) {
        callbackFunc(err);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
};
