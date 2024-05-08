import { Buffer } from "buffer";
import * as path from "path";
import { Readable } from "stream";
import type { PutObjectCommandInput, _Object } from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type HeadObjectCommandOutput,
  ListObjectsV2Command,
  type ListObjectsV2CommandInput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import type { HttpHandlerOptions } from "@aws-sdk/types";
import {
  FetchHttpHandler,
  type FetchHttpHandlerOptions,
} from "@smithy/fetch-http-handler";
// @ts-ignore
import { requestTimeout } from "@smithy/fetch-http-handler/dist-es/request-timeout";
import { type HttpRequest, HttpResponse } from "@smithy/protocol-http";
import { buildQueryString } from "@smithy/querystring-builder";
// biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
import AggregateError from "aggregate-error";
import * as mime from "mime-types";
import { Platform, type RequestUrlParam, requestUrl } from "obsidian";
import PQueue from "p-queue";
import { DEFAULT_CONTENT_TYPE, type S3Config } from "./baseTypes";
import { VALID_REQURL } from "./baseTypesObs";
import { bufferToArrayBuffer, getFolderLevels } from "./misc";

import type { Entity } from "./baseTypes";
import { FakeFs } from "./fsAll";

////////////////////////////////////////////////////////////////////////////////
// special handler using Obsidian requestUrl
////////////////////////////////////////////////////////////////////////////////

/**
 * This is close to origin implementation of FetchHttpHandler
 * https://github.com/aws/aws-sdk-js-v3/blob/main/packages/fetch-http-handler/src/fetch-http-handler.ts
 * that is released under Apache 2 License.
 * But this uses Obsidian requestUrl instead.
 */
class ObsHttpHandler extends FetchHttpHandler {
  requestTimeoutInMs: number | undefined;
  reverseProxyNoSignUrl: string | undefined;
  constructor(
    options?: FetchHttpHandlerOptions,
    reverseProxyNoSignUrl?: string
  ) {
    super(options);
    this.requestTimeoutInMs =
      options === undefined ? undefined : options.requestTimeout;
    this.reverseProxyNoSignUrl = reverseProxyNoSignUrl;
  }
  async handle(
    request: HttpRequest,
    { abortSignal }: HttpHandlerOptions = {}
  ): Promise<{ response: HttpResponse }> {
    if (abortSignal?.aborted) {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      return Promise.reject(abortError);
    }

    let path = request.path;
    if (request.query) {
      const queryString = buildQueryString(request.query);
      if (queryString) {
        path += `?${queryString}`;
      }
    }

    const { port, method } = request;
    let url = `${request.protocol}//${request.hostname}${
      port ? `:${port}` : ""
    }${path}`;
    if (
      this.reverseProxyNoSignUrl !== undefined &&
      this.reverseProxyNoSignUrl !== ""
    ) {
      const urlObj = new URL(url);
      urlObj.host = this.reverseProxyNoSignUrl;
      url = urlObj.href;
    }
    const body =
      method === "GET" || method === "HEAD" ? undefined : request.body;

    const transformedHeaders: Record<string, string> = {};
    for (const key of Object.keys(request.headers)) {
      const keyLower = key.toLowerCase();
      if (keyLower === "host" || keyLower === "content-length") {
        continue;
      }
      transformedHeaders[keyLower] = request.headers[key];
    }

    let contentType: string | undefined = undefined;
    if (transformedHeaders["content-type"] !== undefined) {
      contentType = transformedHeaders["content-type"];
    }

    let transformedBody: any = body;
    if (ArrayBuffer.isView(body)) {
      transformedBody = bufferToArrayBuffer(body);
    }

    const param: RequestUrlParam = {
      body: transformedBody,
      headers: transformedHeaders,
      method: method,
      url: url,
      contentType: contentType,
    };

    const raceOfPromises = [
      requestUrl(param).then((rsp) => {
        const headers = rsp.headers;
        const headersLower: Record<string, string> = {};
        for (const key of Object.keys(headers)) {
          headersLower[key.toLowerCase()] = headers[key];
        }
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(rsp.arrayBuffer));
            controller.close();
          },
        });
        return {
          response: new HttpResponse({
            headers: headersLower,
            statusCode: rsp.status,
            body: stream,
          }),
        };
      }),
      requestTimeout(this.requestTimeoutInMs),
    ];

    if (abortSignal) {
      raceOfPromises.push(
        new Promise<never>((resolve, reject) => {
          abortSignal.onabort = () => {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            reject(abortError);
          };
        })
      );
    }
    return Promise.race(raceOfPromises);
  }
}

////////////////////////////////////////////////////////////////////////////////
// other stuffs
////////////////////////////////////////////////////////////////////////////////

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

export const DEFAULT_S3_CONFIG: S3Config = {
  s3Endpoint: "",
  s3Region: "",
  s3AccessKeyID: "",
  s3SecretAccessKey: "",
  s3BucketName: "",
  bypassCorsLocally: true,
  partsConcurrency: 20,
  forcePathStyle: false,
  remotePrefix: "",
  useAccurateMTime: false, // it causes money, disable by default
  reverseProxyNoSignUrl: "",
  generateFolderObject: false, // new version, by default not generate folders
};

/**
 * The Body of resp of aws GetObject has mix types
 * and we want to get ArrayBuffer here.
 * See https://github.com/aws/aws-sdk-js-v3/issues/1877
 * @param b The Body of GetObject
 * @returns Promise<ArrayBuffer>
 */
const getObjectBodyToArrayBuffer = async (
  b: Readable | ReadableStream | Blob | undefined
) => {
  if (b === undefined) {
    throw Error(`ObjectBody is undefined and don't know how to deal with it`);
  }
  if (b instanceof Readable) {
    return (await new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      b.on("data", (chunk) => chunks.push(chunk));
      b.on("error", reject);
      b.on("end", () => resolve(bufferToArrayBuffer(Buffer.concat(chunks))));
    })) as ArrayBuffer;
  } else if (b instanceof ReadableStream) {
    return await new Response(b, {}).arrayBuffer();
  } else if (b instanceof Blob) {
    return await b.arrayBuffer();
  } else {
    throw TypeError(`The type of ${b} is not one of the supported types`);
  }
};

const getS3Client = (s3Config: S3Config) => {
  let endpoint = s3Config.s3Endpoint;
  if (!(endpoint.startsWith("http://") || endpoint.startsWith("https://"))) {
    endpoint = `https://${endpoint}`;
  }

  let s3Client: S3Client;
  if (VALID_REQURL && s3Config.bypassCorsLocally) {
    s3Client = new S3Client({
      region: s3Config.s3Region,
      endpoint: endpoint,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.s3AccessKeyID,
        secretAccessKey: s3Config.s3SecretAccessKey,
      },
      requestHandler: new ObsHttpHandler(
        undefined,
        s3Config.reverseProxyNoSignUrl
      ),
    });
  } else {
    s3Client = new S3Client({
      region: s3Config.s3Region,
      endpoint: endpoint,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.s3AccessKeyID,
        secretAccessKey: s3Config.s3SecretAccessKey,
      },
    });
  }

  s3Client.middlewareStack.add(
    (next, context) => (args) => {
      (args.request as any).headers["cache-control"] = "no-cache";
      return next(args);
    },
    {
      step: "build",
    }
  );

  return s3Client;
};

const getLocalNoPrefixPath = (
  fileOrFolderPathWithRemotePrefix: string,
  remotePrefix: string
) => {
  if (
    !(
      fileOrFolderPathWithRemotePrefix === `${remotePrefix}` ||
      fileOrFolderPathWithRemotePrefix.startsWith(`${remotePrefix}`)
    )
  ) {
    throw Error(
      `"${fileOrFolderPathWithRemotePrefix}" doesn't starts with "${remotePrefix}"`
    );
  }
  return fileOrFolderPathWithRemotePrefix.slice(`${remotePrefix}`.length);
};

const getRemoteWithPrefixPath = (
  fileOrFolderPath: string,
  remotePrefix: string
) => {
  if (remotePrefix === undefined || remotePrefix === "") {
    return fileOrFolderPath;
  }
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = remotePrefix;
  }
  if (!fileOrFolderPath.startsWith("/")) {
    key = `${remotePrefix}${fileOrFolderPath}`;
  }
  return key;
};

const fromS3ObjectToEntity = (
  x: _Object,
  remotePrefix: string,
  mtimeRecords: Record<string, number>,
  ctimeRecords: Record<string, number>
) => {
  // console.debug(`fromS3ObjectToEntity: ${x.Key!}, ${JSON.stringify(x,null,2)}`);
  // S3 officially only supports seconds precision!!!!!
  const mtimeSvr = Math.floor(x.LastModified!.valueOf() / 1000.0) * 1000;
  let mtimeCli = mtimeSvr;
  if (x.Key! in mtimeRecords) {
    const m2 = mtimeRecords[x.Key!];
    if (m2 !== 0) {
      // to be compatible with RClone, we read and store the time in seconds in new version!
      if (m2 >= 1000000000000) {
        // it's a millsecond, uploaded by old codes..
        mtimeCli = m2;
      } else {
        // it's a second, uploaded by new codes of the plugin from March 24, 2024
        mtimeCli = m2 * 1000;
      }
    }
  }
  const key = getLocalNoPrefixPath(x.Key!, remotePrefix); // we remove prefix here
  const r: Entity = {
    key: key, // from s3's repsective, the keyRaw is the key, we will change it in decyption
    keyRaw: key,
    mtimeSvr: mtimeSvr,
    mtimeCli: mtimeCli,
    sizeRaw: x.Size!,
    size: x.Size!, // from s3's repsective, the sizeRaw is the size, we will change it in decyption
    etag: x.ETag,
    synthesizedFolder: false,
  };
  return r;
};

const fromS3HeadObjectToEntity = (
  fileOrFolderPathWithRemotePrefix: string,
  x: HeadObjectCommandOutput,
  remotePrefix: string,
  useAccurateMTime: boolean
) => {
  // console.debug(`fromS3HeadObjectToEntity: ${fileOrFolderPathWithRemotePrefix}: ${JSON.stringify(x,null,2)}`);
  // S3 officially only supports seconds precision!!!!!
  const mtimeSvr = Math.floor(x.LastModified!.valueOf() / 1000.0) * 1000;
  let mtimeCli = mtimeSvr;
  if (useAccurateMTime && x.Metadata !== undefined) {
    const m2 = Math.floor(
      Number.parseFloat(x.Metadata.mtime || x.Metadata.MTime || "0")
    );
    if (m2 !== 0) {
      // to be compatible with RClone, we read and store the time in seconds in new version!
      if (m2 >= 1000000000000) {
        // it's a millsecond, uploaded by old codes..
        mtimeCli = m2;
      } else {
        // it's a second, uploaded by new codes of the plugin from March 24, 2024
        mtimeCli = m2 * 1000;
      }
    }
  }
  // console.debug(
  //   `fromS3HeadObjectToEntity, fileOrFolderPathWithRemotePrefix=${fileOrFolderPathWithRemotePrefix}, remotePrefix=${remotePrefix}, x=${JSON.stringify(
  //     x
  //   )} `
  // );
  const key = getLocalNoPrefixPath(
    fileOrFolderPathWithRemotePrefix,
    remotePrefix
  );
  // console.debug(`fromS3HeadObjectToEntity, key=${key} after removing prefix`);
  return {
    key: key,
    keyRaw: key,
    mtimeSvr: mtimeSvr,
    mtimeCli: mtimeCli,
    sizeRaw: x.ContentLength,
    size: x.ContentLength,
    etag: x.ETag,
    synthesizedFolder: false,
  } as Entity;
};

export class FakeFsS3 extends FakeFs {
  s3Config: S3Config;
  s3Client: S3Client;
  kind: "s3";
  synthFoldersCache: Record<string, Entity>;
  constructor(s3Config: S3Config) {
    super();
    this.s3Config = s3Config;
    this.s3Client = getS3Client(s3Config);
    this.kind = "s3";
    this.synthFoldersCache = {};
  }

  async walk(): Promise<Entity[]> {
    const res = (await this._walkFromRoot(this.s3Config.remotePrefix)).filter(
      (x) => x.key !== "" && x.key !== "/"
    );
    return res;
  }

  /**
   * the input key contains basedir (prefix),
   * but the result doesn't contain it.
   */
  async _walkFromRoot(prefixOfRawKeys: string | undefined) {
    const confCmd = {
      Bucket: this.s3Config.s3BucketName,
    } as ListObjectsV2CommandInput;
    if (prefixOfRawKeys !== undefined && prefixOfRawKeys !== "") {
      confCmd.Prefix = prefixOfRawKeys;
    }

    const contents = [] as _Object[];
    const mtimeRecords: Record<string, number> = {};
    const ctimeRecords: Record<string, number> = {};
    const queueHead = new PQueue({
      concurrency: this.s3Config.partsConcurrency,
      autoStart: true,
    });
    queueHead.on("error", (error) => {
      queueHead.pause();
      queueHead.clear();
      throw error;
    });

    let isTruncated = true;
    do {
      const rsp = await this.s3Client.send(new ListObjectsV2Command(confCmd));

      if (rsp.$metadata.httpStatusCode !== 200) {
        throw Error("some thing bad while listing remote!");
      }
      if (rsp.Contents === undefined) {
        break;
      }
      contents.push(...rsp.Contents);

      if (this.s3Config.useAccurateMTime) {
        // head requests of all objects, love it
        for (const content of rsp.Contents) {
          queueHead.add(async () => {
            const rspHead = await this.s3Client.send(
              new HeadObjectCommand({
                Bucket: this.s3Config.s3BucketName,
                Key: content.Key,
              })
            );
            if (rspHead.$metadata.httpStatusCode !== 200) {
              throw Error("some thing bad while heading single object!");
            }
            if (rspHead.Metadata === undefined) {
              // pass
            } else {
              mtimeRecords[content.Key!] = Math.floor(
                Number.parseFloat(
                  rspHead.Metadata.mtime || rspHead.Metadata.MTime || "0"
                )
              );
              ctimeRecords[content.Key!] = Math.floor(
                Number.parseFloat(
                  rspHead.Metadata.ctime || rspHead.Metadata.CTime || "0"
                )
              );
            }
          });
        }
      }

      isTruncated = rsp.IsTruncated ?? false;
      confCmd.ContinuationToken = rsp.NextContinuationToken;
      if (
        isTruncated &&
        (confCmd.ContinuationToken === undefined ||
          confCmd.ContinuationToken === "")
      ) {
        throw Error("isTruncated is true but no continuationToken provided");
      }
    } while (isTruncated);

    // wait for any head requests
    await queueHead.onIdle();

    // ensemble fake rsp
    // in the end, we need to transform the response list
    // back to the local contents-alike list
    const res: Entity[] = [];
    const realEnrities = new Set<string>();
    for (const remoteObj of contents) {
      const remoteEntity = fromS3ObjectToEntity(
        remoteObj,
        this.s3Config.remotePrefix ?? "",
        mtimeRecords,
        ctimeRecords
      );
      realEnrities.add(remoteEntity.key!);
      res.push(remoteEntity);

      for (const f of getFolderLevels(remoteEntity.key!, true)) {
        if (realEnrities.has(f)) {
          delete this.synthFoldersCache[f];
          continue;
        }
        if (
          !this.synthFoldersCache.hasOwnProperty(f) ||
          remoteEntity.mtimeSvr! >= this.synthFoldersCache[f].mtimeSvr!
        ) {
          this.synthFoldersCache[f] = {
            key: f,
            keyRaw: f,
            size: 0,
            sizeRaw: 0,
            sizeEnc: 0,
            mtimeSvr: remoteEntity.mtimeSvr,
            mtimeSvrFmt: remoteEntity.mtimeSvrFmt,
            mtimeCli: remoteEntity.mtimeCli,
            mtimeCliFmt: remoteEntity.mtimeCliFmt,
            synthesizedFolder: true,
          };
        }
      }
    }
    for (const key of Object.keys(this.synthFoldersCache)) {
      res.push(this.synthFoldersCache[key]);
    }
    return res;
  }

  async stat(key: string): Promise<Entity> {
    if (this.synthFoldersCache.hasOwnProperty(key)) {
      return this.synthFoldersCache[key];
    }
    let keyFullPath = key;
    keyFullPath = getRemoteWithPrefixPath(
      keyFullPath,
      this.s3Config.remotePrefix ?? ""
    );
    return await this._statFromRoot(keyFullPath);
  }

  /**
   * the input key contains basedir (prefix),
   * but the result doesn't contain it.
   */
  async _statFromRoot(key: string): Promise<Entity> {
    if (
      this.s3Config.remotePrefix !== undefined &&
      this.s3Config.remotePrefix !== "" &&
      !key.startsWith(this.s3Config.remotePrefix)
    ) {
      throw Error(`_statFromRoot should only accept prefix-ed path`);
    }
    const res = await this.s3Client.send(
      new HeadObjectCommand({
        Bucket: this.s3Config.s3BucketName,
        Key: key,
      })
    );

    return fromS3HeadObjectToEntity(
      key,
      res,
      this.s3Config.remotePrefix ?? "",
      this.s3Config.useAccurateMTime ?? false
    );
  }

  async mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity> {
    if (!key.endsWith("/")) {
      throw new Error(`You should not call mkdir on ${key}!`);
    }

    const generateFolderObject = this.s3Config.generateFolderObject ?? false;
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

    const uploadFile = getRemoteWithPrefixPath(
      key,
      this.s3Config.remotePrefix ?? ""
    );
    return await this._mkdirFromRoot(uploadFile, mtime, ctime);
  }

  async _mkdirFromRoot(key: string, mtime?: number, ctime?: number) {
    if (
      this.s3Config.remotePrefix !== undefined &&
      this.s3Config.remotePrefix !== "" &&
      !key.startsWith(this.s3Config.remotePrefix)
    ) {
      throw Error(`_mkdirFromRoot should only accept prefix-ed path`);
    }

    const contentType = DEFAULT_CONTENT_TYPE;
    const p: PutObjectCommandInput = {
      Bucket: this.s3Config.s3BucketName,
      Key: key,
      Body: "",
      ContentType: contentType,
      ContentLength: 0, // interesting we need to set this to avoid the warning
    };
    const metadata: Record<string, string> = {};
    if (mtime !== undefined && mtime !== 0) {
      metadata["MTime"] = `${mtime / 1000.0}`;
    }
    if (ctime !== undefined && ctime !== 0) {
      metadata["CTime"] = `${ctime / 1000.0}`;
    }
    if (Object.keys(metadata).length > 0) {
      p["Metadata"] = metadata;
    }
    await this.s3Client.send(new PutObjectCommand(p));
    return await this._statFromRoot(key);
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    const uploadFile = getRemoteWithPrefixPath(
      key,
      this.s3Config.remotePrefix ?? ""
    );
    const res = await this._writeFileFromRoot(
      uploadFile,
      content,
      mtime,
      ctime
    );
    return res;
  }

  /**
   * the input key contains basedir (prefix),
   * but the result doesn't contain it.
   */
  async _writeFileFromRoot(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    if (
      this.s3Config.remotePrefix !== undefined &&
      this.s3Config.remotePrefix !== "" &&
      !key.startsWith(this.s3Config.remotePrefix)
    ) {
      throw Error(`_writeFileFromRoot should only accept prefix-ed path`);
    }

    const bytesIn5MB = 5242880;
    const body = new Uint8Array(content);

    let contentType = DEFAULT_CONTENT_TYPE;
    contentType =
      mime.contentType(mime.lookup(key) || DEFAULT_CONTENT_TYPE) ||
      DEFAULT_CONTENT_TYPE;

    const upload = new Upload({
      client: this.s3Client,
      queueSize: this.s3Config.partsConcurrency, // concurrency
      partSize: bytesIn5MB, // minimal 5MB by default
      leavePartsOnError: false,
      params: {
        Bucket: this.s3Config.s3BucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
        Metadata: {
          MTime: `${mtime / 1000.0}`,
          CTime: `${ctime / 1000.0}`,
        },
      },
    });
    upload.on("httpUploadProgress", (progress) => {
      // console.info(progress);
    });
    await upload.done();

    return await this._statFromRoot(key);
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    if (key.endsWith("/")) {
      throw new Error(`you should not call readFile on folder ${key}`);
    }
    const downloadFile = getRemoteWithPrefixPath(
      key,
      this.s3Config.remotePrefix ?? ""
    );

    return await this._readFileFromRoot(downloadFile);
  }

  async _readFileFromRoot(key: string): Promise<ArrayBuffer> {
    if (
      this.s3Config.remotePrefix !== undefined &&
      this.s3Config.remotePrefix !== "" &&
      !key.startsWith(this.s3Config.remotePrefix)
    ) {
      throw Error(`_readFileFromRoot should only accept prefix-ed path`);
    }
    const data = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.s3Config.s3BucketName,
        Key: key,
      })
    );
    const bodyContents = await getObjectBodyToArrayBuffer(data.Body);
    return bodyContents;
  }

  async rm(key: string): Promise<void> {
    if (key === "/") {
      return;
    }

    if (this.synthFoldersCache.hasOwnProperty(key)) {
      delete this.synthFoldersCache[key];
      return;
    }

    const remoteFileName = getRemoteWithPrefixPath(
      key,
      this.s3Config.remotePrefix ?? ""
    );

    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.s3Config.s3BucketName,
        Key: remoteFileName,
      })
    );

    // TODO: do we need to delete folder recursively?
    // maybe we should not
    // because the outer sync algorithm should do that
    // (await this._walkFromRoot(remoteFileName)).map(...)
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    try {
      // TODO: no universal way now, just check this in connectivity
      if (Platform.isIosApp && this.s3Config.s3Endpoint.startsWith("http://")) {
        throw Error(
          `Your s3 endpoint could only be https, not http, because of the iOS restriction.`
        );
      }

      // const results = await this.s3Client.send(
      //   new HeadBucketCommand({ Bucket: this.s3Config.s3BucketName })
      // );
      // very simplified version of listing objects
      const confCmd = {
        Bucket: this.s3Config.s3BucketName,
      } as ListObjectsV2CommandInput;
      const results = await this.s3Client.send(
        new ListObjectsV2Command(confCmd)
      );

      if (
        results === undefined ||
        results.$metadata === undefined ||
        results.$metadata.httpStatusCode === undefined
      ) {
        const err = "results or $metadata or httStatusCode is undefined";
        console.debug(err);
        if (callbackFunc !== undefined) {
          callbackFunc(err);
        }
        return false;
      }
      return results.$metadata.httpStatusCode === 200;
    } catch (err: any) {
      console.debug(err);
      if (callbackFunc !== undefined) {
        if (this.s3Config.s3Endpoint.contains(this.s3Config.s3BucketName)) {
          const err2 = new AggregateError([
            err,
            new Error(
              "Maybe you've included the bucket name inside the endpoint setting. Please remove the bucket name and try again."
            ),
          ]);
          callbackFunc(err2);
        } else {
          callbackFunc(err);
        }
      }

      return false;
    }
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
