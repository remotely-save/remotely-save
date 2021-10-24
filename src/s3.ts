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
} from "@aws-sdk/client-s3";

import type { _Object } from "@aws-sdk/client-s3";

import { bufferToArrayBuffer, mkdirpInVault } from "./misc";
import * as mime from "mime-types";

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
  isRecursively: boolean = false
) => {
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
        Key: fileOrFolderPath,
        Body: "",
        ContentType: contentType,
      })
    );
    return await getRemoteMeta(s3Client, s3Config, fileOrFolderPath);
  } else {
    // file
    // we ignore isRecursively parameter here
    const contentType =
      mime.contentType(mime.lookup(fileOrFolderPath) || DEFAULT_CONTENT_TYPE) ||
      DEFAULT_CONTENT_TYPE;
    const content = await vault.adapter.readBinary(fileOrFolderPath);
    const body = Buffer.from(content);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: s3Config.s3BucketName,
        Key: fileOrFolderPath,
        Body: body,
        ContentType: contentType,
      })
    );
    return await getRemoteMeta(s3Client, s3Config, fileOrFolderPath);
  }
};

export const listFromRemote = async (
  s3Client: S3Client,
  s3Config: S3Config,
  prefix?: string
) => {
  if (prefix !== undefined) {
    return await s3Client.send(
      new ListObjectsV2Command({
        Bucket: s3Config.s3BucketName,
        Prefix: prefix,
      })
    );
  }
  return await s3Client.send(
    new ListObjectsV2Command({ Bucket: s3Config.s3BucketName })
  );
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
  mtime: number
) => {
  const isFolder = fileOrFolderPath.endsWith("/");

  await mkdirpInVault(fileOrFolderPath, vault);

  if (isFolder) {
    // mkdirp locally is enough
    // do nothing here
  } else {
    const content = await downloadFromRemoteRaw(
      s3Client,
      s3Config,
      fileOrFolderPath
    );
    await vault.adapter.writeBinary(fileOrFolderPath, content, {
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
  fileOrFolderPath: string
) => {
  if (fileOrFolderPath === "/") {
    return;
  }
  if (fileOrFolderPath.endsWith("/")) {
    const x = await listFromRemote(s3Client, s3Config, fileOrFolderPath);
    x.Contents.forEach(async (element) => {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: s3Config.s3BucketName,
          Key: element.Key,
        })
      );
    });
  } else {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: s3Config.s3BucketName,
        Key: fileOrFolderPath,
      })
    );
  }
};
