import type { _Object } from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  HeadObjectCommandOutput,
  ListObjectsV2Command,
  ListObjectsV2CommandInput,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { HttpHandler, HttpRequest, HttpResponse } from "@smithy/protocol-http";
import {
  FetchHttpHandler,
  FetchHttpHandlerOptions,
} from "@smithy/fetch-http-handler";
// @ts-ignore
import { requestTimeout } from "@smithy/fetch-http-handler/dist-es/request-timeout";
import { buildQueryString } from "@smithy/querystring-builder";
import { HeaderBag, HttpHandlerOptions, Provider } from "@aws-sdk/types";
import { Buffer } from "buffer";
import * as mime from "mime-types";
import { Vault, requestUrl, RequestUrlParam } from "obsidian";
import { Readable } from "stream";
import * as path from "path";
import AggregateError from "aggregate-error";
import {
  DEFAULT_CONTENT_TYPE,
  RemoteItem,
  S3Config,
  VALID_REQURL,
} from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import {
  arrayBufferToBuffer,
  bufferToArrayBuffer,
  mkdirpInVault,
} from "./misc";

export { S3Client } from "@aws-sdk/client-s3";

import { log } from "./moreOnLog";
import PQueue from "p-queue";

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
  requestTimeoutInMs: number;
  constructor(options?: FetchHttpHandlerOptions) {
    super(options);
    this.requestTimeoutInMs =
      options === undefined ? undefined : options.requestTimeout;
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
    const url = `${request.protocol}//${request.hostname}${
      port ? `:${port}` : ""
    }${path}`;
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

    let contentType: string = undefined;
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
};

export type S3ObjectType = _Object;

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

const getRemoteWithPrefixPath = (
  fileOrFolderPath: string,
  remotePrefix: string
) => {
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

const fromS3ObjectToRemoteItem = (
  x: S3ObjectType,
  remotePrefix: string,
  mtimeRecords: Record<string, number>,
  ctimeRecords: Record<string, number>
) => {
  let mtime = x.LastModified.valueOf();
  if (x.Key in mtimeRecords) {
    const m2 = mtimeRecords[x.Key];
    if (m2 !== 0) {
      mtime = m2;
    }
  }
  const r: RemoteItem = {
    key: getLocalNoPrefixPath(x.Key, remotePrefix),
    lastModified: mtime,
    size: x.Size,
    remoteType: "s3",
    etag: x.ETag,
  };
  return r;
};

const fromS3HeadObjectToRemoteItem = (
  fileOrFolderPathWithRemotePrefix: string,
  x: HeadObjectCommandOutput,
  remotePrefix: string,
  useAccurateMTime: boolean
) => {
  let mtime = x.LastModified.valueOf();
  if (useAccurateMTime && x.Metadata !== undefined) {
    const m2 = Math.round(
      parseFloat(x.Metadata.mtime || x.Metadata.MTime || "0")
    );
    if (m2 !== 0) {
      mtime = m2;
    }
  }
  return {
    key: getLocalNoPrefixPath(fileOrFolderPathWithRemotePrefix, remotePrefix),
    lastModified: mtime,
    size: x.ContentLength,
    remoteType: "s3",
    etag: x.ETag,
  } as RemoteItem;
};

export const getS3Client = (s3Config: S3Config) => {
  let endpoint = s3Config.s3Endpoint;
  if (!(endpoint.startsWith("http://") || endpoint.startsWith("https://"))) {
    endpoint = `https://${endpoint}`;
  }

  let s3Client: S3Client;

  if (VALID_REQURL && s3Config.bypassCorsLocally) {
    s3Client = new S3Client({
      region: s3Config.s3Region !== "" ? s3Config.s3Region : undefined,
      endpoint: endpoint,
      forcePathStyle: s3Config.forcePathStyle,
      credentials: {
        accessKeyId: s3Config.s3AccessKeyID,
        secretAccessKey: s3Config.s3SecretAccessKey,
      },
      requestHandler: new ObsHttpHandler(),
    });
  } else {
    s3Client = new S3Client({
      region: s3Config.s3Region !== "" ? s3Config.s3Region : undefined,
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

export const getRemoteMeta = async (
  s3Client: S3Client,
  s3Config: S3Config,
  fileOrFolderPathWithRemotePrefix: string
) => {
  if (
    s3Config.remotePrefix !== "" &&
    !fileOrFolderPathWithRemotePrefix.startsWith(s3Config.remotePrefix)
  ) {
    throw Error(`s3 getRemoteMeta should only accept prefix-ed path`);
  }
  const res = await s3Client.send(
    new HeadObjectCommand({
      Bucket: s3Config.s3BucketName,
      Key: fileOrFolderPathWithRemotePrefix,
    })
  );

  return fromS3HeadObjectToRemoteItem(
    fileOrFolderPathWithRemotePrefix,
    res,
    s3Config.remotePrefix,
    s3Config.useAccurateMTime
  );
};

export const uploadToRemote = async (
  s3Client: S3Client,
  s3Config: S3Config,
  fileOrFolderPath: string,
  vault: Vault,
  isRecursively: boolean = false,
  password: string = "",
  remoteEncryptedKey: string = "",
  uploadRaw: boolean = false,
  rawContent: string | ArrayBuffer = "",
  rawContentMTime: number = 0,
  rawContentCTime: number = 0
) => {
  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    uploadFile = remoteEncryptedKey;
  }
  uploadFile = getRemoteWithPrefixPath(uploadFile, s3Config.remotePrefix);
  const isFolder = fileOrFolderPath.endsWith("/");

  if (isFolder && isRecursively) {
    throw Error("upload function doesn't implement recursive function yet!");
  } else if (isFolder && !isRecursively) {
    if (uploadRaw) {
      throw Error(`you specify uploadRaw, but you also provide a folder key!`);
    }
    // folder
    let mtime = 0;
    let ctime = 0;
    const s = await vault.adapter.stat(fileOrFolderPath);
    if (s !== null) {
      mtime = s.mtime;
      ctime = s.ctime;
    }
    const contentType = DEFAULT_CONTENT_TYPE;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Config.s3BucketName,
        Key: uploadFile,
        Body: "",
        ContentType: contentType,
        Metadata: {
          MTime: `${mtime}`,
          CTime: `${ctime}`,
        },
      })
    );
    return await getRemoteMeta(s3Client, s3Config, uploadFile);
  } else {
    // file
    // we ignore isRecursively parameter here
    let contentType = DEFAULT_CONTENT_TYPE;
    if (password === "") {
      contentType =
        mime.contentType(
          mime.lookup(fileOrFolderPath) || DEFAULT_CONTENT_TYPE
        ) || DEFAULT_CONTENT_TYPE;
    }
    let localContent = undefined;
    let mtime = 0;
    let ctime = 0;
    if (uploadRaw) {
      if (typeof rawContent === "string") {
        localContent = new TextEncoder().encode(rawContent).buffer;
      } else {
        localContent = rawContent;
      }
      mtime = rawContentMTime;
      ctime = rawContentCTime;
    } else {
      localContent = await vault.adapter.readBinary(fileOrFolderPath);
      const s = await vault.adapter.stat(fileOrFolderPath);
      if (s !== null) {
        mtime = s.mtime;
        ctime = s.ctime;
      }
    }
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }

    const bytesIn5MB = 5242880;
    const body = new Uint8Array(remoteContent);

    const upload = new Upload({
      client: s3Client,
      queueSize: s3Config.partsConcurrency, // concurrency
      partSize: bytesIn5MB, // minimal 5MB by default
      leavePartsOnError: false,
      params: {
        Bucket: s3Config.s3BucketName,
        Key: uploadFile,
        Body: body,
        ContentType: contentType,
        Metadata: {
          MTime: `${mtime}`,
          CTime: `${ctime}`,
        },
      },
    });
    upload.on("httpUploadProgress", (progress) => {
      // log.info(progress);
    });
    await upload.done();

    return await getRemoteMeta(s3Client, s3Config, uploadFile);
  }
};

const listFromRemoteRaw = async (
  s3Client: S3Client,
  s3Config: S3Config,
  prefixOfRawKeys?: string
) => {
  const confCmd = {
    Bucket: s3Config.s3BucketName,
  } as ListObjectsV2CommandInput;
  if (prefixOfRawKeys !== undefined && prefixOfRawKeys !== "") {
    confCmd.Prefix = prefixOfRawKeys;
  }

  const contents = [] as _Object[];
  const mtimeRecords: Record<string, number> = {};
  const ctimeRecords: Record<string, number> = {};
  const queueHead = new PQueue({
    concurrency: s3Config.partsConcurrency,
    autoStart: true,
  });
  queueHead.on("error", (error) => {
    queueHead.pause();
    queueHead.clear();
    throw error;
  });

  let isTruncated = true;
  do {
    const rsp = await s3Client.send(new ListObjectsV2Command(confCmd));

    if (rsp.$metadata.httpStatusCode !== 200) {
      throw Error("some thing bad while listing remote!");
    }
    if (rsp.Contents === undefined) {
      break;
    }
    contents.push(...rsp.Contents);

    if (s3Config.useAccurateMTime) {
      // head requests of all objects, love it
      for (const content of rsp.Contents) {
        queueHead.add(async () => {
          const rspHead = await s3Client.send(
            new HeadObjectCommand({
              Bucket: s3Config.s3BucketName,
              Key: content.Key,
            })
          );
          if (rspHead.$metadata.httpStatusCode !== 200) {
            throw Error("some thing bad while heading single object!");
          }
          if (rspHead.Metadata === undefined) {
            // pass
          } else {
            mtimeRecords[content.Key] = Math.round(
              parseFloat(
                rspHead.Metadata.mtime || rspHead.Metadata.MTime || "0"
              )
            );
            ctimeRecords[content.Key] = Math.round(
              parseFloat(
                rspHead.Metadata.ctime || rspHead.Metadata.CTime || "0"
              )
            );
          }
        });
      }
    }

    isTruncated = rsp.IsTruncated;
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
  return {
    Contents: contents.map((x) =>
      fromS3ObjectToRemoteItem(
        x,
        s3Config.remotePrefix,
        mtimeRecords,
        ctimeRecords
      )
    ),
  };
};

export const listAllFromRemote = async (
  s3Client: S3Client,
  s3Config: S3Config
) => {
  return await listFromRemoteRaw(s3Client, s3Config, s3Config.remotePrefix);
};

/**
 * The Body of resp of aws GetObject has mix types
 * and we want to get ArrayBuffer here.
 * See https://github.com/aws/aws-sdk-js-v3/issues/1877
 * @param b The Body of GetObject
 * @returns Promise<ArrayBuffer>
 */
const getObjectBodyToArrayBuffer = async (
  b: Readable | ReadableStream | Blob
) => {
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

const downloadFromRemoteRaw = async (
  s3Client: S3Client,
  s3Config: S3Config,
  fileOrFolderPathWithRemotePrefix: string
) => {
  if (
    s3Config.remotePrefix !== "" &&
    !fileOrFolderPathWithRemotePrefix.startsWith(s3Config.remotePrefix)
  ) {
    throw Error(`downloadFromRemoteRaw should only accept prefix-ed path`);
  }
  const data = await s3Client.send(
    new GetObjectCommand({
      Bucket: s3Config.s3BucketName,
      Key: fileOrFolderPathWithRemotePrefix,
    })
  );
  const bodyContents = await getObjectBodyToArrayBuffer(data.Body);
  return bodyContents;
};

export const downloadFromRemote = async (
  s3Client: S3Client,
  s3Config: S3Config,
  fileOrFolderPath: string,
  vault: Vault,
  mtime: number,
  password: string = "",
  remoteEncryptedKey: string = "",
  skipSaving: boolean = false
) => {
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
    downloadFile = getRemoteWithPrefixPath(downloadFile, s3Config.remotePrefix);
    const remoteContent = await downloadFromRemoteRaw(
      s3Client,
      s3Config,
      downloadFile
    );
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

/**
 * This function deals with file normally and "folder" recursively.
 * @param s3Client
 * @param s3Config
 * @param fileOrFolderPath
 * @returns
 */
export const deleteFromRemote = async (
  s3Client: S3Client,
  s3Config: S3Config,
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
  remoteFileName = getRemoteWithPrefixPath(
    remoteFileName,
    s3Config.remotePrefix
  );
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Config.s3BucketName,
      Key: remoteFileName,
    })
  );

  if (fileOrFolderPath.endsWith("/") && password === "") {
    const x = await listFromRemoteRaw(s3Client, s3Config, remoteFileName);
    x.Contents.forEach(async (element) => {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: s3Config.s3BucketName,
          Key: element.key,
        })
      );
    });
  } else if (fileOrFolderPath.endsWith("/") && password !== "") {
    // TODO
  } else {
    // pass
  }
};

/**
 * Check the config of S3 by heading bucket
 * https://stackoverflow.com/questions/50842835
 *
 * Updated on 20240102:
 * Users are not always have permission of heading bucket,
 * so we need to use listing objects instead...
 *
 * @param s3Client
 * @param s3Config
 * @returns
 */
export const checkConnectivity = async (
  s3Client: S3Client,
  s3Config: S3Config,
  callbackFunc?: any
) => {
  try {
    // const results = await s3Client.send(
    //   new HeadBucketCommand({ Bucket: s3Config.s3BucketName })
    // );
    // very simplified version of listing objects
    const confCmd = {
      Bucket: s3Config.s3BucketName,
    } as ListObjectsV2CommandInput;
    const results = await s3Client.send(new ListObjectsV2Command(confCmd));

    if (
      results === undefined ||
      results.$metadata === undefined ||
      results.$metadata.httpStatusCode === undefined
    ) {
      const err = "results or $metadata or httStatusCode is undefined";
      log.debug(err);
      if (callbackFunc !== undefined) {
        callbackFunc(err);
      }
      return false;
    }
    return results.$metadata.httpStatusCode === 200;
  } catch (err) {
    log.debug(err);
    if (callbackFunc !== undefined) {
      if (s3Config.s3Endpoint.contains(s3Config.s3BucketName)) {
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
};
