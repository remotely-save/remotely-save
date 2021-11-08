import { Buffer } from "buffer";
import { Readable } from "stream";

import { Vault } from "obsidian";

import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
  ListObjectsV2CommandInput,
  ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

import type { _Object } from "@aws-sdk/client-s3";

import {
  arrayBufferToBuffer,
  bufferToArrayBuffer,
  mkdirpInVault,
} from "./misc";
import * as mime from "mime-types";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";

export interface S3Config {
  s3Endpoint: string;
  s3Region: string;
  s3AccessKeyID: string;
  s3SecretAccessKey: string;
  s3BucketName: string;
}

export const DEFAULT_S3_CONFIG = {
  s3Endpoint: "",
  s3Region: "",
  s3AccessKeyID: "",
  s3SecretAccessKey: "",
  s3BucketName: "",
};

export type S3ObjectType = _Object;

export const getS3Client = (s3Config: S3Config) => {
  const s3Client = new S3Client({
    region: s3Config.s3Region,
    endpoint: s3Config.s3Endpoint,
    credentials: {
      accessKeyId: s3Config.s3AccessKeyID,
      secretAccessKey: s3Config.s3SecretAccessKey,
    },
  });
  return s3Client;
};

export const getRemoteMeta = async (
  s3Client: S3Client,
  s3Config: S3Config,
  fileOrFolderPath: string
) => {
  return await s3Client.send(
    new HeadObjectCommand({
      Bucket: s3Config.s3BucketName,
      Key: fileOrFolderPath,
    })
  );
};

export const uploadToRemote = async (
  s3Client: S3Client,
  s3Config: S3Config,
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
  const isFolder = fileOrFolderPath.endsWith("/");

  const DEFAULT_CONTENT_TYPE = "application/octet-stream";

  if (isFolder && isRecursively) {
    throw Error("upload function doesn't implement recursive function yet!");
  } else if (isFolder && !isRecursively) {
    // folder
    const contentType = DEFAULT_CONTENT_TYPE;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Config.s3BucketName,
        Key: uploadFile,
        Body: "",
        ContentType: contentType,
      })
    );
    return await getRemoteMeta(s3Client, s3Config, fileOrFolderPath);
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
    const localContent = await vault.adapter.readBinary(fileOrFolderPath);
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }
    const body = arrayBufferToBuffer(remoteContent);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Config.s3BucketName,
        Key: uploadFile,
        Body: body,
        ContentType: contentType,
      })
    );
    return await getRemoteMeta(s3Client, s3Config, uploadFile);
  }
};

export const listFromRemote = async (
  s3Client: S3Client,
  s3Config: S3Config,
  prefix?: string
) => {
  const confCmd = {
    Bucket: s3Config.s3BucketName,
  } as ListObjectsV2CommandInput;
  if (prefix !== undefined) {
    confCmd.Prefix = prefix;
  }

  const contents = [] as _Object[];

  let isTruncated = true;
  let continuationToken = "";
  do {
    const rsp = await s3Client.send(new ListObjectsV2Command(confCmd));

    if (rsp.$metadata.httpStatusCode !== 200) {
      throw Error("some thing bad while listing remote!");
    }
    if (rsp.Contents === undefined) {
      break;
    }
    contents.push(...rsp.Contents);

    isTruncated = rsp.IsTruncated;
    confCmd.ContinuationToken = rsp.NextContinuationToken;
    if (
      isTruncated &&
      (continuationToken === undefined || continuationToken === "")
    ) {
      throw Error("isTruncated is true but no continuationToken provided");
    }
  } while (isTruncated);

  // ensemble fake rsp
  return {
    "$.metadata": {
      httpStatusCode: 200,
    },
    Contents: contents,
  };
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
    const chunks: Uint8Array[] = [];
    for await (let chunk of b) {
      chunks.push(chunk);
    }
    const buf = Buffer.concat(chunks);
    return bufferToArrayBuffer(buf);
  } else if (b instanceof ReadableStream) {
    return await new Response(b, {}).arrayBuffer();
  } else if (b instanceof Blob) {
    return await b.arrayBuffer();
  } else {
    throw TypeError(`The type of ${b} is not one of the supported types`);
  }
};

export const downloadFromRemoteRaw = async (
  s3Client: S3Client,
  s3Config: S3Config,
  fileOrFolderPath: string
) => {
  const data = await s3Client.send(
    new GetObjectCommand({
      Bucket: s3Config.s3BucketName,
      Key: fileOrFolderPath,
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
    const remoteContent = await downloadFromRemoteRaw(
      s3Client,
      s3Config,
      downloadFile
    );
    let localContent = remoteContent;
    if (password !== "") {
      localContent = await decryptArrayBuffer(remoteContent, password);
    }
    await vault.adapter.writeBinary(fileOrFolderPath, localContent, {
      mtime: mtime,
    });
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
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: s3Config.s3BucketName,
      Key: remoteFileName,
    })
  );

  if (fileOrFolderPath.endsWith("/") && password === "") {
    const x = await listFromRemote(s3Client, s3Config, fileOrFolderPath);
    x.Contents.forEach(async (element) => {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: s3Config.s3BucketName,
          Key: element.Key,
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
 * @param s3Client
 * @param s3Config
 * @returns
 */
export const checkS3Connectivity = async (
  s3Client: S3Client,
  s3Config: S3Config
) => {
  try {
    const results = await s3Client.send(
      new HeadBucketCommand({ Bucket: s3Config.s3BucketName })
    );
    if (
      results === undefined ||
      results.$metadata === undefined ||
      results.$metadata.httpStatusCode === undefined
    ) {
      return false;
    }
    return results.$metadata.httpStatusCode === 200;
  } catch (err) {
    return false;
  }
};
