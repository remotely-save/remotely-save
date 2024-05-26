import isEqual from "lodash/isEqual";
// import {
//   makePatches,
//   applyPatches,
//   stringifyPatches,
//   parsePatch,
// } from "@sanity/diff-match-patch";
import {
  LCS,
  diff3Merge,
  diffComm,
  diffPatch,
  mergeDiff3,
  mergeDigIn,
  patch,
} from "node-diff3";
import type { Entity } from "../../src/baseTypes";
import { copyFile } from "../../src/copyLogic";
import type { FakeFs } from "../../src/fsAll";
import { MERGABLE_SIZE } from "./baseTypesPro";

export function isMergable(a: Entity, b?: Entity) {
  if (b !== undefined && a.keyRaw !== b.keyRaw) {
    return false;
  }

  return (
    !a.keyRaw.endsWith("/") &&
    a.sizeRaw <= MERGABLE_SIZE &&
    (a.keyRaw.endsWith(".md") || a.keyRaw.endsWith(".markdown"))
  );
}

/**
 * slightly modify to adjust in markdown context
 * @param a
 * @param o
 * @param b
 */
function mergeDigInModified(a: string, o: string, b: string) {
  const { conflict, result } = mergeDigIn(a, o, b);
  for (let index = 0; index < result.length; ++index) {
    if (["<<<<<<<", "=======", ">>>>>>>"].contains(result[index])) {
      result[index] = "`" + result[index] + "`";
    }
  }
  return {
    conflict,
    result,
  };
}

function getLCSText(a: string, b: string) {
  const aa = a.split("\n");
  const bb = b.split("\n");
  let raw = LCS(aa, bb);

  const k: string[] = [];

  do {
    k.unshift(aa[raw.buffer1index]);

    raw = raw.chain as any;
  } while (raw !== null && raw !== undefined && raw.buffer1index !== -1);

  return k.join("\n");
}

/**
 * It's tricky. We find LCS then pretend it's the original text
 * @param a
 * @param b
 * @returns
 */
function twoWayMerge(a: string, b: string): string {
  // const c = getLCSText(a, b);
  // const patches = makePatches(c, a);
  // const [d] = applyPatches(patches, b);
  const c = getLCSText(a, b);
  const d = mergeDigInModified(a, c, b).result.join("\n");
  return d;
}

/**
 * Originally three way merge.
 * @param a
 * @param b
 * @param orig
 * @returns
 */
function threeWayMerge(a: string, b: string, orig: string) {
  return mergeDigInModified(a, orig, b).result.join("\n");
}

export async function mergeFile(
  key: string,
  left: FakeFs,
  right: FakeFs,
  contentOrig: ArrayBuffer | null | undefined
) {
  // console.debug(
  //   `mergeFile: key=${key}, left=${left.kind}, right=${right.kind}`
  // );
  if (key.endsWith("/")) {
    throw Error(`should not call ${key} in mergeFile`);
  }

  if (!key.endsWith(".md") && !key.endsWith(".markdown")) {
    throw Error(`currently only support markdown files in mergeFile`);
  }

  const [contentLeft, contentRight] = await Promise.all([
    left.readFile(key),
    right.readFile(key),
  ]);

  let newArrayBuffer: ArrayBuffer | undefined = undefined;
  const decoder = new TextDecoder("utf-8");

  if (isEqual(contentLeft, contentRight)) {
    // we are lucky enough
    newArrayBuffer = contentLeft;
    // TODO: save the write
  } else {
    if (contentOrig === null || contentOrig === undefined) {
      const newText = twoWayMerge(
        decoder.decode(contentLeft),
        decoder.decode(contentRight)
      );
      // no need to worry about the offset here because the array is new and not sliced
      newArrayBuffer = new TextEncoder().encode(newText).buffer;
    } else {
      const newText = threeWayMerge(
        decoder.decode(contentLeft),
        decoder.decode(contentRight),
        decoder.decode(contentOrig)
      );
      newArrayBuffer = new TextEncoder().encode(newText).buffer;
    }
  }

  const mtime = Date.now();

  // left (local) must wait for the right
  // because the mtime might be different after upload
  // upload firstly
  const rightEntity = await right.writeFile(key, newArrayBuffer, mtime, mtime);
  // write local secondly
  const leftEntity = await left.writeFile(
    key,
    newArrayBuffer,
    rightEntity.mtimeCli ?? mtime,
    rightEntity.mtimeCli ?? mtime
  );

  return {
    entity: rightEntity,
    content: newArrayBuffer,
  };
}

export function getFileRename(key: string) {
  if (
    key === "" ||
    key === "." ||
    key === ".." ||
    key === "/" ||
    key.endsWith("/")
  ) {
    throw Error(`we cannot rename key=${key}`);
  }

  const segsPath = key.split("/");
  const name = segsPath[segsPath.length - 1];
  const segsName = name.split(".");

  if (segsName.length === 0) {
    throw Error(`we cannot rename key=${key}`);
  } else if (segsName.length === 1) {
    // name = "kkk" without any dot
    segsPath[segsPath.length - 1] = `${name}.dup`;
  } else if (segsName.length === 2) {
    if (segsName[0] === "") {
      // name = ".kkkk" with leading dot
      segsPath[segsPath.length - 1] = `${name}.dup`;
    } else if (segsName[1] === "") {
      // name = "kkkk." with tailing dot
      segsPath[segsPath.length - 1] = `${segsName[0]}.dup`;
    } else {
      // name = "aaa.bbb" normally
      segsPath[segsPath.length - 1] = `${segsName[0]}.dup.${segsName[1]}`;
    }
  } else {
    // name = "[...].bbb.ccc"
    const firstPart = segsName.slice(0, segsName.length - 1).join(".");
    const thirdPart = segsName[segsName.length - 1];
    segsPath[segsPath.length - 1] = `${firstPart}.dup.${thirdPart}`;
  }
  const res = segsPath.join("/");
  return res;
}

/**
 * local: x.md -> x.dup.md -> upload to remote
 * remote: x.md -> download to local -> using original name x.md
 */
export async function duplicateFile(
  key: string,
  left: FakeFs,
  right: FakeFs,
  uploadCallback: (entity: Entity) => Promise<any>,
  downloadCallback: (entity: Entity) => Promise<any>
) {
  let key2 = getFileRename(key);
  let usable = false;
  do {
    try {
      const s = await left.stat(key2);
      if (s === null || s === undefined) {
        throw Error(`not exist $${key2}`);
      }
      console.debug(`key2=${key2} exists, cannot use for new file`);
      key2 = getFileRename(key2);
      console.debug(`key2=${key2} is prepared for next try`);
    } catch (e) {
      // not exists, exactly what we want
      console.debug(`key2=${key2} doesn't exist, usable for new file`);
      usable = true;
    }
  } while (!usable);
  await left.rename(key, key2);

  /**
   * x.dup.md -> upload to remote
   */
  async function f1() {
    const k = await copyFile(key2, left, right);
    await uploadCallback(k.entity);
    return k.entity;
  }

  /**
   * x.md -> download to local
   */
  async function f2() {
    const k = await copyFile(key, right, left);
    await downloadCallback(k.entity);
    return k.entity;
  }

  const [resUpload, resDownload] = await Promise.all([f1(), f2()]);

  return {
    upload: resUpload,
    download: resDownload,
  };
}
