import cloneDeep from "lodash/cloneDeep";
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
  if (b !== undefined && a.key !== b.key) {
    return false;
  }

  return (
    !a.key!.endsWith("/") &&
    a.sizeRaw <= MERGABLE_SIZE &&
    (a.key!.endsWith(".md") || a.key!.endsWith(".markdown"))
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
  // hack:
  // writing to remote with encryption will move the arraybuffer to worker
  // so the newArrayBuffer is not usable later
  // we have to copy here
  // because mergable files should not be too large
  // so the performance should not be too bad
  // TODO: optimize for non-encryption mode?
  const newArrayBufferCopied = cloneDeep(newArrayBuffer);
  const rightEntity = await right.writeFile(
    key,
    newArrayBufferCopied,
    mtime,
    mtime
  );
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

export function getFileRenameForDup(key: string) {
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

function arraysAreEqual(arr1: ArrayBuffer, arr2: ArrayBuffer) {
  if (arr1.byteLength !== arr2.byteLength) {
    return false;
  }
  const u1 = new Uint8Array(arr1);
  const u2 = new Uint8Array(arr2);

  for (let i = 0; i < u1.byteLength; ++i) {
    if (u1[i] !== u2[i]) {
      return false;
    }
  }

  return true;
}

/**
 * 1. download remote
 * 2. compare
 * 3. if the same, update local but not upload
 * 4. if not the same, rename local and save remote
 */
async function tryDuplicateFileForSameSizes(
  key: string,
  key2: string,
  fsLocal: FakeFs,
  fsRemote: FakeFs,
  uploadCallback: (entity: Entity | undefined) => Promise<any>,
  downloadCallback: (entity: Entity | undefined) => Promise<any>
) {
  console.debug(`tryDuplicateFileForSameSizes: ${key}`);

  // 1. download
  const remoteContent = await fsRemote.readFile(key);

  // 2. compare
  const localContent = await fsLocal.readFile(key);
  const eq = arraysAreEqual(localContent, remoteContent);

  if (eq) {
    // 3. if the same, update local but not upload
    // read meta of remote, as if we have downloaded the file
    console.debug(`tryDuplicateFileForSameSizes: ${key} content equal`);
    const entityRemote = await fsRemote.stat(key);

    // write
    const downloadResultEntity = await fsLocal.writeFile(
      key,
      remoteContent,
      entityRemote.mtimeCli ?? Date.now(),
      entityRemote.mtimeCli ?? Date.now()
    );
    await downloadCallback(downloadResultEntity);

    // no uploadCallback here
  } else {
    // 4. if not the same, rename local and save remote
    console.debug(`tryDuplicateFileForSameSizes: ${key} content not equal`);

    await fsLocal.rename(key, key2);

    const entityRemote = await fsRemote.stat(key);
    const downloadResultEntity = await fsLocal.writeFile(
      key,
      remoteContent,
      entityRemote.mtimeCli ?? Date.now(),
      entityRemote.mtimeCli ?? Date.now()
    );
    await downloadCallback(downloadResultEntity);

    const entityLocal = await fsLocal.stat(key2); // key2 here!
    const uploadResultEntity = await fsRemote.writeFile(
      key2, // key2 here!
      localContent,
      entityLocal.mtimeCli ?? Date.now(),
      entityLocal.mtimeCli ?? Date.now()
    );
    await uploadCallback(uploadResultEntity);
  }
}

/**
 * local: x.md -> x.dup.md -> upload to remote
 * remote: x.md -> download to local -> using original name x.md
 */
async function tryDuplicateFileForDiffSizes(
  key: string,
  key2: string,
  fsLocal: FakeFs,
  fsRemote: FakeFs,
  uploadCallback: (entity: Entity | undefined) => Promise<any>,
  downloadCallback: (entity: Entity | undefined) => Promise<any>
) {
  console.debug(`tryDuplicateFileForDiffSizes: ${key}`);

  await fsLocal.rename(key, key2);

  /**
   * x.dup.md -> upload to remote
   */
  async function f1() {
    const k = await copyFile(key2, fsLocal, fsRemote);
    await uploadCallback(k.entity);
    return k.entity;
  }

  /**
   * x.md -> download to local
   */
  async function f2() {
    const k = await copyFile(key, fsRemote, fsLocal);
    await downloadCallback(k.entity);
    return k.entity;
  }

  const [resUpload, resDownload] = await Promise.all([f1(), f2()]);

  return {
    upload: resUpload,
    download: resDownload,
  };
}

export async function tryDuplicateFile(
  key: string,
  fsLocal: FakeFs,
  fsRemote: FakeFs,
  uploadCallback: (entity: Entity | undefined) => Promise<any>,
  downloadCallback: (entity: Entity | undefined) => Promise<any>
) {
  let key2 = getFileRenameForDup(key);
  let usable = false;
  do {
    try {
      const s = await fsLocal.stat(key2);
      if (s === null || s === undefined) {
        throw Error(`not exist $${key2}`);
      }
      console.debug(`key2=${key2} exists, cannot use for new file`);
      key2 = getFileRenameForDup(key2);
      console.debug(`key2=${key2} is prepared for next try`);
    } catch (e) {
      // not exists, exactly what we want
      console.debug(`key2=${key2} doesn't exist, usable for new file`);
      usable = true;
    }
  } while (!usable);

  const localSize = await fsLocal.stat(key);
  const remoteSize = await fsRemote.stat(key);

  if (
    localSize !== undefined &&
    remoteSize !== undefined &&
    localSize.sizeRaw === remoteSize.sizeRaw
  ) {
    return await tryDuplicateFileForSameSizes(
      key,
      key2,
      fsLocal,
      fsRemote,
      uploadCallback,
      downloadCallback
    );
  } else {
    return await tryDuplicateFileForDiffSizes(
      key,
      key2,
      fsLocal,
      fsRemote,
      uploadCallback,
      downloadCallback
    );
  }
}
