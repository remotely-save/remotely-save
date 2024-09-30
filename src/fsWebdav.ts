import { Buffer } from "buffer";
import { Queue } from "@fyears/tsqueue";
import { getReasonPhrase } from "http-status-codes/build/cjs/utils-functions";
import chunk from "lodash/chunk";
import cloneDeep from "lodash/cloneDeep";
import flatten from "lodash/flatten";
import { Platform, type RequestUrlParam, requestUrl } from "obsidian";
import type {
  FileStat,
  RequestOptionsWithState,
  WebDAVClient,
  // Response,
  // ResponseDataDetailed,
} from "webdav";
import type { Entity, WebdavConfig } from "./baseTypes";
import { VALID_REQURL } from "./baseTypesObs";
import { FakeFs } from "./fsAll";
import { bufferToArrayBuffer, delay, splitFileSizeToChunkRanges } from "./misc";

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

      const reqContentType =
        transformedHeaders["accept"] ?? transformedHeaders["content-type"];

      const retractedHeaders = { ...transformedHeaders };
      if (retractedHeaders.hasOwnProperty("authorization")) {
        retractedHeaders["authorization"] = "<retracted>";
      }

      // console.debug(`before request:`);
      // console.debug(`url: ${options.url}`);
      // console.debug(`method: ${options.method}`);
      // console.debug(`headers: ${JSON.stringify(retractedHeaders, null, 2)}`);
      // console.debug(`reqContentType: ${reqContentType}`);

      const p: RequestUrlParam = {
        url: options.url,
        method: options.method,
        body: options.data as string | ArrayBuffer,
        headers: transformedHeaders,
        contentType: reqContentType,
        throw: false,
      };

      let r = await requestUrl(p);

      if (
        r.status === 401 &&
        Platform.isIosApp &&
        !options.url.endsWith("/") &&
        !options.url.endsWith(".md") &&
        options.method.toUpperCase() === "PROPFIND"
      ) {
        // don't ask me why,
        // some webdav servers have some mysterious behaviours,
        // if a folder doesn't exist without slash, the servers return 401 instead of 404
        // here is a dirty hack that works
        console.debug(`so we have 401, try appending request url with slash`);
        p.url = `${options.url}/`;
        r = await requestUrl(p);
      }

      // console.debug(`after request:`);
      const rspHeaders = objKeyToLower({ ...r.headers });
      // console.debug(`rspHeaders: ${JSON.stringify(rspHeaders, null, 2)}`);
      for (const key in rspHeaders) {
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
            // console.debug(`rspHeaders[key] needs encode: ${key}`);
            rspHeaders[key] = encodeURIComponent(rspHeaders[key]);
          }
        }
      }

      let r2: Response | undefined = undefined;
      const statusText = getReasonPhrase(r.status);
      // console.debug(`statusText: ${statusText}`);
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
// biome-ignore lint: we want to ts-ignore the next line
import { AuthType, BufferLike, createClient } from "webdav/dist/web/index.js";

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

/**
 * sometimes the path startswith /../../......
 * we want to make sure the path is compatible
 */
const stripLeadingPath = (x: string) => {
  let y = x;
  while (y.startsWith("/..")) {
    y = y.slice("/..".length);
  }
  return y;
};

const getNormPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  const strippedFileOrFolderPath = stripLeadingPath(fileOrFolderPath);
  if (
    !(
      strippedFileOrFolderPath === `/${remoteBaseDir}` ||
      strippedFileOrFolderPath.startsWith(`/${remoteBaseDir}/`)
    )
  ) {
    throw Error(
      `"${fileOrFolderPath}" after stripping doesn't starts with "/${remoteBaseDir}/"`
    );
  }
  const result = strippedFileOrFolderPath.slice(`/${remoteBaseDir}/`.length);
  return result;
};

const fromWebdavItemToEntity = (x: FileStat, remoteBaseDir: string): Entity => {
  let key = getNormPath(x.filename, remoteBaseDir);

  if (x.type === "directory" && !key.endsWith("/")) {
    key = `${key}/`;
  }
  const mtimeSvr = Date.parse(x.lastmod).valueOf();
  return {
    key: key,
    keyRaw: key,
    mtimeSvr: mtimeSvr,
    mtimeCli: mtimeSvr, // TODO: no universal way to set mtime in webdav
    size: x.size,
    sizeRaw: x.size,
  };
};

const tryEncodeURI = (x: string) => {
  if (x.includes("%")) {
    // likely encoded before!
    return x;
  }
  return encodeURI(x);
};

const tryEncodeUsernamePassword = (x: string) => {
  if (onlyAscii(x)) {
    return x;
  }
  return unescape(encodeURIComponent(x));
};

const parseCustomHeaders = (x: string): Record<string, string> => {
  const y = x.trim();
  if (y === "") {
    return {};
  }
  const z = y.split("\n");

  const res: Record<string, string> = {};

  for (const kv of z) {
    if (!kv.includes(":")) {
      continue;
    }

    const [keyRaw, ...valueArr] = kv.split(":");
    const key = keyRaw.trim();
    const value = valueArr.join(":").trim();
    res[key] = value;
  }

  return res;
};

export class FakeFsWebdav extends FakeFs {
  kind: "webdav";

  webdavConfig: WebdavConfig;
  remoteBaseDir: string;
  client!: WebDAVClient;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;

  supportApachePartial: boolean;
  supportSabrePartial: boolean;
  isNextcloud: boolean;
  nextcloudUploadServerAddress: string;

  constructor(
    webdavConfig: WebdavConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "webdav";
    this.webdavConfig = cloneDeep(webdavConfig);
    this.webdavConfig.address = tryEncodeURI(this.webdavConfig.address);
    this.remoteBaseDir = this.webdavConfig.remoteBaseDir || vaultName || "";
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;

    this.supportApachePartial = false;
    this.supportSabrePartial = false;
    this.isNextcloud = false;
    this.nextcloudUploadServerAddress = "";
  }

  async _init() {
    // init client if not inited
    if (this.client !== undefined) {
      return;
    }

    const cacheHeader = {
      "Cache-Control": "no-cache",
    };
    const customHeaders = parseCustomHeaders(
      this.webdavConfig.customHeaders ?? ""
    );
    const headers = { ...cacheHeader, ...customHeaders };

    if (
      this.webdavConfig.username !== "" &&
      this.webdavConfig.password !== ""
    ) {
      this.client = createClient(this.webdavConfig.address, {
        username: tryEncodeUsernamePassword(this.webdavConfig.username),
        password: tryEncodeUsernamePassword(this.webdavConfig.password),
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

    await this._checkPartialSupport();
  }

  /**
   * <server>/remote.php/dav/files/<userid>
   * => <server>/remote.php/dav/uploads/<userid>
   */
  _getnextcloudUploadServerAddress = () => {
    let k = this.webdavConfig.address;
    if (k.endsWith("/")) {
      // no tailing slash
      k = k.substring(0, k.length - 1);
    }
    const s = k.split("/");
    if (
      s.length > 3 &&
      s[s.length - 3] === "dav" &&
      s[s.length - 2] === "files" &&
      s[s.length - 1] !== ""
    ) {
      s[s.length - 2] = "uploads";
      return s.join("/");
    }
    throw Error(`cannot construct upload address for ${s}`);
  };

  async _checkPartialSupport() {
    const compliance = await this.client.getDAVCompliance(
      `/${this.remoteBaseDir}/`
    );

    for (const c of compliance.compliance) {
      // nextcloud AND with an account
      if (
        c.toLocaleLowerCase().includes("nextcloud") &&
        this.webdavConfig.username !== "" &&
        this.webdavConfig.password !== ""
      ) {
        // the address is parsable
        const s = this.webdavConfig.address.split("/");
        if (
          s.length > 3 &&
          s[s.length - 3] === "dav" &&
          s[s.length - 2] === "files" &&
          s[s.length - 1] !== ""
        ) {
          this.isNextcloud = true;
          this.nextcloudUploadServerAddress =
            this._getnextcloudUploadServerAddress();
          console.debug(
            `isNextcloud=${this.isNextcloud}, uploadFolder=${this.nextcloudUploadServerAddress}`
          );
          return true;
        } else {
          return false;
        }
      }
    }

    // taken from https://github.com/perry-mitchell/webdav-client/blob/master/source/operations/partialUpdateFileContents.ts
    // which is under MIT license
    if (
      compliance.server.includes("Apache") &&
      compliance.compliance.includes("<http://apache.org/dav/propset/fs/1>")
    ) {
      this.supportApachePartial = true;
      console.debug(
        `supportApachePartial=true, compliance=${JSON.stringify(compliance)}`
      );
      return true;
    }

    if (compliance.compliance.includes("sabredav-partialupdate")) {
      this.supportSabrePartial = true;
      console.debug(
        `supportSabrePartial=true, compliance=${JSON.stringify(compliance)}`
      );
      return true;
    }

    return false;
  }

  async walk(): Promise<Entity[]> {
    await this._init();

    let contents = [] as FileStat[];
    if (
      this.webdavConfig.depth === "auto" ||
      this.webdavConfig.depth === "auto_unknown" ||
      this.webdavConfig.depth === "auto_1" ||
      this.webdavConfig.depth === "auto_infinity" /* don't trust auto now */ ||
      this.webdavConfig.depth === "manual_1" ||
      this.webdavConfig.address.includes("jianguoyun.com") ||
      this.webdavConfig.address.includes("teracloud.jp")
    ) {
      // the remote doesn't support infinity propfind,
      // we need to do a bfs here
      const q = new Queue([`/${this.remoteBaseDir}`]);
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
          const r = singleChunk.map(async (x) => {
            let k = (await this.client.getDirectoryContents(x, {
              deep: false,
              details: false /* no need for verbose details here */,
              // TODO: to support .obsidian,
              // we need to load all files including dot,
              // anyway to reduce the resources?
              // glob: "/**" /* avoid dot files by using glob */,
            })) as FileStat[];
            k = k.filter((sub) => stripLeadingPath(sub.filename) !== x);
            return k;
          });
          const r3 = await Promise.all(r);
          for (const r4 of r3) {
            if (
              this.webdavConfig.address.includes("jianguoyun.com") &&
              r4.length >= 749
            ) {
              // https://help.jianguoyun.com/?p=2064
              // no more than 750 per request
              throw Error(
                `出错：坚果云 api 有限制，文件列表加载不全。终止同步！`
              );
            }
          }
          const r2 = flatten(r3);
          subContents.push(...r2);
        }
        for (let i = 0; i < subContents.length; ++i) {
          const f = subContents[i];
          contents.push(f);
          if (f.type === "directory") {
            q.push(stripLeadingPath(f.filename));
          }
        }
      }
    } else {
      // the remote supports infinity propfind
      contents = (await this.client.getDirectoryContents(
        `/${this.remoteBaseDir}`,
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

    const result = contents
      .map((x) => fromWebdavItemToEntity(x, this.remoteBaseDir))
      .filter((x) => x.keyRaw !== "/");
    return result;
  }

  async walkPartial(): Promise<Entity[]> {
    await this._init();

    const contents = (await this.client.getDirectoryContents(
      `/${this.remoteBaseDir}`,
      {
        deep: false, // partial, no need to recursive here
        details: false /* no need for verbose details here */,
      }
    )) as FileStat[];
    return contents
      .map((x) => fromWebdavItemToEntity(x, this.remoteBaseDir))
      .filter((x) => x.keyRaw !== "/");
  }

  async stat(key: string): Promise<Entity> {
    await this._init();
    const fullPath = getWebdavPath(key, this.remoteBaseDir);
    return await this._statFromRoot(fullPath);
  }

  async _statFromRoot(key: string): Promise<Entity> {
    const res = (await this.client.stat(key, {
      details: false,
    })) as FileStat;
    return fromWebdavItemToEntity(res, this.remoteBaseDir);
  }

  async mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity> {
    if (!key.endsWith("/")) {
      throw Error(`you should not call mkdir on ${key}`);
    }
    await this._init();
    const uploadFile = getWebdavPath(key, this.remoteBaseDir);
    return await this._mkdirFromRoot(uploadFile, mtime, ctime);
  }

  async _mkdirFromRoot(
    key: string,
    mtime?: number,
    ctime?: number
  ): Promise<Entity> {
    // the sync algorithm should do recursive manually already.
    // if we set recursive: true here, Digest auth will return some error inside the PROPFIND
    await this.client.createDirectory(key, {
      recursive: false,
    });
    return await this._statFromRoot(key);
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    if (key.endsWith("/")) {
      throw Error(`you should not call writeFile on ${key}`);
    }
    await this._init();
    const uploadFile = getWebdavPath(key, this.remoteBaseDir);
    return await this._writeFileFromRoot(
      uploadFile,
      content,
      mtime,
      ctime,
      key
    );
  }

  async _writeFileFromRoot(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number,
    origKey: string
  ): Promise<Entity> {
    // less than 10 MB
    if (content.byteLength <= 10 * 1024 * 1024) {
      return await this._writeFileFromRootFull(
        key,
        content,
        mtime,
        ctime,
        origKey
      );
    }

    // larger than 10 MB
    if (
      !this.isNextcloud &&
      !this.supportApachePartial &&
      !this.supportSabrePartial
    ) {
      // give up and upload by whole, and directly return
      return await this._writeFileFromRootFull(
        key,
        content,
        mtime,
        ctime,
        origKey
      );
    }

    // try to upload by chunks
    try {
      if (this.isNextcloud) {
        return await this._writeFileFromRootNextcloud(
          key,
          content,
          mtime,
          ctime,
          origKey
        );
      } else if (this.supportApachePartial) {
        return await this._writeFileFromRootApachePartial(
          key,
          content,
          mtime,
          ctime,
          origKey
        );
      } else if (this.supportSabrePartial) {
        return await this._writeFileFromRootSabrePartial(
          key,
          content,
          mtime,
          ctime,
          origKey
        );
      }
      throw Error(`Error: partial upload / update method is not implemented??`);
    } catch (e) {
      console.error(
        `we fail to write file partially for nextcloud or apache or sabre/dav, stop!`
      );
      console.error(e);
      throw e;
      // this.isNextcloud = false;
      // this.supportApachePartial = false;
      // return await this._writeFileFromRootFull(
      //   key,
      //   content,
      //   mtime,
      //   ctime,
      //   origKey
      // );
    }
  }

  async _writeFileFromRootFull(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number,
    origKey: string
  ): Promise<Entity> {
    // console.debug(`start _writeFileFromRootFull`);
    await this.client.putFileContents(key, content, {
      overwrite: true,
      onUploadProgress: (progress: any) => {
        console.info(`Uploaded ${progress.loaded} bytes of ${progress.total}`);
      },
    });
    const k = await this._statFromRoot(key);
    // console.debug(`end _writeFileFromRootFull`);
    return k;
  }

  /**
   * https://docs.nextcloud.com/server/latest/developer_manual/client_apis/WebDAV/chunking.html
   * @param key
   * @param content
   * @param mtime
   * @param ctime
   * @returns
   */
  async _writeFileFromRootNextcloud(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number,
    origKey: string
  ): Promise<Entity> {
    if (key.endsWith("/")) {
      throw Error(
        `key=${key} should not have tailing slash in _writeFileFromRootNextcloud`
      );
    }
    const destUrl = `${this.webdavConfig.address}/${encodeURI(key)}`;
    console.debug(`destUrl=${destUrl}`);

    const getTmpFolder = (x: string) => {
      if (x.endsWith("/")) {
        throw Error(`file to upload by chunk should not ends with /`);
      }
      const y = x.split("/");
      const z = encodeURI(`${y[y.length - 1]}`);
      return z;
    };

    const uploadServerAddress = this.nextcloudUploadServerAddress;
    console.debug(`uploadServerAddress=${uploadServerAddress}`);
    const tmpFolderName = getTmpFolder(key);
    console.debug(`tmpFolderName=${tmpFolderName}`);

    const clientForUpload = createClient(uploadServerAddress, {
      username: tryEncodeUsernamePassword(this.webdavConfig.username),
      password: tryEncodeUsernamePassword(this.webdavConfig.password),
      headers: {
        "Cache-Control": "no-cache",
      },
      authType:
        this.webdavConfig.authType === "digest"
          ? AuthType.Digest
          : AuthType.Password,
    });

    // create folder
    await clientForUpload.createDirectory(tmpFolderName, {
      method: "MKCOL",
      headers: {
        Destination: destUrl,
      },
    });
    console.debug(`finish creating folder`);

    // upload by chunks
    const sizePerChunk = 5 * 1024 * 1024; // 5 mb
    const chunkRanges = splitFileSizeToChunkRanges(
      content.byteLength,
      sizePerChunk
    );
    for (let i = 0; i < chunkRanges.length; ++i) {
      const { start, end } = chunkRanges[i];
      const tmpFileName = `${i + 1}`.padStart(5, "0");
      const tmpFileNameWithFolder = `${tmpFolderName}/${tmpFileName}`;
      console.debug(
        `start to upload chunk ${
          i + 1
        } to ${tmpFileNameWithFolder} with startInclusive=${start}, endInclusive=${end}`
      );
      await clientForUpload.putFileContents(
        tmpFileNameWithFolder,
        content.slice(start, end + 1),
        {
          headers: {
            Destination: destUrl,
            "OC-Total-Length": `${content.byteLength}`,
          },
        }
      );
    }
    console.debug(`finish upload all chunks`);

    // move to assemble
    const fakeFileToMoveUrl = `${tmpFolderName}/.file`;
    console.debug(`fakeFileToMoveUrl=${fakeFileToMoveUrl}`);
    await clientForUpload.customRequest(fakeFileToMoveUrl, {
      method: "MOVE",
      headers: {
        Destination: destUrl,
        "OC-Total-Length": `${content.byteLength}`,
      },
    });
    console.debug(`finish moving file`);
    // TODO: setting X-OC-Mtime

    // stat
    console.debug(`before stat origKey=${origKey}`);
    const k = await this.stat(origKey);
    console.debug(`after stat`);
    if (k.sizeRaw !== content.byteLength) {
      // we failed!
      this.isNextcloud = false; // give up next time!
      const err = `unable to upload file ${key} by chunks to nextcloud`;
      console.error(err);
      throw Error(err);
    }
    console.debug(`after stat, k=${JSON.stringify(k, null, 2)}`);

    return k;
  }

  async _writeFileFromRootApachePartial(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number,
    origKey: string
  ): Promise<Entity> {
    // firstly upload a 0-byte data
    await this._writeFileFromRootFull(
      key,
      new ArrayBuffer(0),
      mtime,
      ctime,
      origKey
    );

    // then "update" by chunks
    const sizePerChunk = 5 * 1024 * 1024; // 5 mb
    const chunkRanges = splitFileSizeToChunkRanges(
      content.byteLength,
      sizePerChunk
    );

    // TODO: parallel
    for (let i = 0; i < chunkRanges.length; ++i) {
      const { start, end } = chunkRanges[i];
      await this.client.partialUpdateFileContents(
        key,
        start,
        end,
        content.slice(start, end + 1)
      );
    }

    // lastly return
    return await this.stat(origKey);
  }

  async _writeFileFromRootSabrePartial(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number,
    origKey: string
  ): Promise<Entity> {
    // firstly upload a 0-byte data
    await this._writeFileFromRootFull(
      key,
      new ArrayBuffer(0),
      mtime,
      ctime,
      origKey
    );

    // then "update" by chunks
    const sizePerChunk = 5 * 1024 * 1024; // 5 mb
    const chunkRanges = splitFileSizeToChunkRanges(
      content.byteLength,
      sizePerChunk
    );

    // diff from apachePartial: we use "append" header here for dufs...
    // we cannot parallel here
    for (let i = 0; i < chunkRanges.length; ++i) {
      const { start, end } = chunkRanges[i];
      await this.client.customRequest(key, {
        method: "PATCH",
        headers: {
          "X-Update-Range": "append",
          "Content-Type": "application/x-sabredav-partialupdate",
        },
        data: content.slice(start, end + 1),
      });
    }

    // lastly return
    return await this.stat(origKey);
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    if (key.endsWith("/")) {
      throw Error(`you should not call readFile on ${key}`);
    }
    await this._init();
    const downloadFile = getWebdavPath(key, this.remoteBaseDir);
    return await this._readFileFromRoot(downloadFile);
  }

  async _readFileFromRoot(key: string): Promise<ArrayBuffer> {
    const buff = (await this.client.getFileContents(key)) as BufferLike;
    if (buff instanceof ArrayBuffer) {
      return buff;
    } else if (buff instanceof Buffer) {
      return bufferToArrayBuffer(buff);
    }
    throw Error(`unexpected file content result with type ${typeof buff}`);
  }

  async rename(key1: string, key2: string): Promise<void> {
    if (key1 === "/" || key2 === "/") {
      return;
    }
    const remoteFileName1 = getWebdavPath(key1, this.remoteBaseDir);
    const remoteFileName2 = getWebdavPath(key2, this.remoteBaseDir);
    await this._init();
    await this.client.moveFile(remoteFileName1, remoteFileName2);
  }

  async rm(key: string): Promise<void> {
    if (key === "/") {
      return;
    }
    await this._init();
    try {
      const remoteFileName = getWebdavPath(key, this.remoteBaseDir);
      await this.client.deleteFile(remoteFileName);
      // console.info(`delete ${remoteFileName} succeeded`);
    } catch (err) {
      console.error("some error while deleting");
      console.error(err);
    }
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    if (
      !(
        this.webdavConfig.address.startsWith("http://") ||
        this.webdavConfig.address.startsWith("https://")
      )
    ) {
      const err =
        "Error: the url should start with http(s):// but it does not!";
      console.error(err);
      if (callbackFunc !== undefined) {
        callbackFunc(err);
      }
      return false;
    }

    try {
      await this._init();
      const results = await this._statFromRoot(`/${this.remoteBaseDir}/`);
      if (results === undefined) {
        throw Error("cannot stat root vault folder!");
      }
    } catch (err) {
      console.error(err);
      callbackFunc?.(err);
      return false;
    }

    return await this.checkConnectCommonOps(callbackFunc);
  }

  async getUserDisplayName(): Promise<string> {
    throw new Error("Method not implemented.");
  }

  async revokeAuth() {
    throw new Error("Method not implemented.");
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
