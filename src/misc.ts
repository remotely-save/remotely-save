import { Vault } from "obsidian";
import * as path from "path";

import { base32 } from "rfc4648";

export type SUPPORTED_SERVICES_TYPE = "s3" | "webdav" | "ftp";

export const ignoreHiddenFiles = (item: string) => {
  const basename = path.basename(item);
  return basename === "." || basename[0] !== ".";
};

/**
 * Util func for mkdir -p based on the "path" of original file or folder
 * "a/b/c/" => ["a", "a/b", "a/b/c"]
 * "a/b/c/d/e.txt" => ["a", "a/b", "a/b/c", "a/b/c/d"]
 * @param x string
 * @returns string[] might be empty
 */
export const getFolderLevels = (x: string) => {
  const res: string[] = [];

  if (x === "" || x === "/") {
    return res;
  }

  const y1 = x.split("/");
  let i = 0;
  for (let index = 0; index + 1 < y1.length; index++) {
    res.push(y1.slice(0, index + 1).join("/"));
  }
  return res;
};

export const mkdirpInVault = async (thePath: string, vault: Vault) => {
  const foldersToBuild = getFolderLevels(thePath);
  for (const folder of foldersToBuild) {
    const r = await vault.adapter.exists(folder);
    if (!r) {
      console.log(`mkdir ${folder}`);
      await vault.adapter.mkdir(folder);
    }
  }
};

/**
 * https://stackoverflow.com/questions/8609289
 * @param b Buffer
 * @returns ArrayBuffer
 */
export const bufferToArrayBuffer = (b: Buffer | Uint8Array) => {
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

/**
 * Simple func.
 * @param b
 * @returns
 */
export const arrayBufferToBuffer = (b: ArrayBuffer) => {
  return Buffer.from(b);
};

export const arrayBufferToBase64 = (b: ArrayBuffer) => {
  return arrayBufferToBuffer(b).toString("base64");
};

export const arrayBufferToHex = (b: ArrayBuffer) => {
  return arrayBufferToBuffer(b).toString("hex");
};

export const base64ToArrayBuffer = (b64text: string) => {
  return bufferToArrayBuffer(Buffer.from(b64text, "base64"));
};

/**
 * https://stackoverflow.com/questions/43131242
 * @param hex
 * @returns
 */
export const hexStringToTypedArray = (hex: string) => {
  return new Uint8Array(
    hex.match(/[\da-f]{2}/gi).map(function (h) {
      return parseInt(h, 16);
    })
  );
};

export const base64ToBase32 = (a: string) => {
  return base32.stringify(Buffer.from(a, "base64"));
};
