import { Vault } from "obsidian";
import * as path from "path";

import { base32 } from "rfc4648";

export type SUPPORTED_SERVICES_TYPE = "s3" | "webdav" | "ftp";

/**
 * If any part of the file starts with '.' or '_' then it's a hidden file.
 * @param item
 * @param loose
 * @returns
 */
export const isHiddenPath = (item: string, loose: boolean = true) => {
  const k = path.posix.normalize(item); // TODO: only unix path now
  const k2 = k.split("/"); // TODO: only unix path now
  // console.log(k2)
  for (const singlePart of k2) {
    if (singlePart === "." || singlePart === ".." || singlePart === "") {
      continue;
    }
    if (singlePart[0] === ".") {
      return true;
    }
    if (loose && singlePart[0] === "_") {
      return true;
    }
  }
  return false;
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
  console.log(thePath);
  const foldersToBuild = getFolderLevels(thePath);
  console.log(foldersToBuild);
  for (const folder of foldersToBuild) {
    const r = await vault.adapter.exists(folder);
    console.log(r);
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
