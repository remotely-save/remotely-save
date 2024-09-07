import * as path from "path";
import type { Vault } from "obsidian";

import emojiRegex from "emoji-regex";
import { base32 } from "rfc4648";
import XRegExp from "xregexp";

declare global {
  interface Window {
    moment: (...data: any) => any;
  }
}

/**
 * If any part of the file starts with '.' or '_' then it's a hidden file.
 * @param item
 * @param dot
 * @param underscore
 * @returns
 */
export const isHiddenPath = (item: string, dot = true, underscore = true) => {
  if (!(dot || underscore)) {
    throw Error("parameter error for isHiddenPath");
  }
  const k = path.posix.normalize(item); // TODO: only unix path now
  const k2 = k.split("/"); // TODO: only unix path now
  // console.info(k2)
  for (const singlePart of k2) {
    if (singlePart === "." || singlePart === ".." || singlePart === "") {
      continue;
    }
    if (dot && singlePart[0] === ".") {
      return true;
    }
    if (underscore && singlePart[0] === "_") {
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
export const getFolderLevels = (x: string, addEndingSlash = false) => {
  const res: string[] = [];

  if (x === "" || x === "/") {
    return res;
  }

  const y1 = x.split("/");
  const i = 0;
  for (let index = 0; index + 1 < y1.length; index++) {
    let k = y1.slice(0, index + 1).join("/");
    if (k === "" || k === "/") {
      continue;
    }
    if (addEndingSlash) {
      k = `${k}/`;
    }
    res.push(k);
  }
  return res;
};

export const mkdirpInVault = async (thePath: string, vault: Vault) => {
  // console.info(thePath);
  const foldersToBuild = getFolderLevels(thePath);
  // console.info(foldersToBuild);
  for (const folder of foldersToBuild) {
    const r = await vault.adapter.exists(folder);
    // console.info(r);
    if (!r) {
      console.info(`mkdir ${folder}`);
      await vault.adapter.mkdir(folder);
    }
  }
};

/**
 * https://stackoverflow.com/questions/8609289
 * @param b Buffer
 * @returns ArrayBuffer
 */
export const bufferToArrayBuffer = (
  b: Buffer | Uint8Array | ArrayBufferView
) => {
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

export const copyArrayBuffer = (src: ArrayBuffer) => {
  const dst = new ArrayBuffer(src.byteLength);
  new Uint8Array(dst).set(new Uint8Array(src));
  return dst;
};

/**
 * https://stackoverflow.com/questions/43131242
 * @param hex
 * @returns
 */
export const hexStringToTypedArray = (hex: string) => {
  const f = hex.match(/[\da-f]{2}/gi);
  if (f === null) {
    throw Error(`input ${hex} is not hex, no way to transform`);
  }
  return new Uint8Array(f.map((h) => Number.parseInt(h, 16)));
};

export const base64ToBase32 = (a: string) => {
  return base32.stringify(Buffer.from(a, "base64"));
};

export const base64ToBase64url = (a: string, pad = false) => {
  let b = a.replace(/\+/g, "-").replace(/\//g, "_");
  if (!pad) {
    b = b.replace(/=/g, "");
  }
  return b;
};

/**
 * iOS Safari could decrypt string with invalid password!
 * So we need an extra way to test the decrypted result.
 * One simple way is testing the result are "valid", printable chars or not.
 *
 * https://stackoverflow.com/questions/6198986
 * https://www.regular-expressions.info/unicode.html
 * Manual test shows that emojis like '🍎' match '\\p{Cs}',
 * so we need to write the regrex in a form that \p{C} minus \p{Cs}
 * @param a
 */
export const isVaildText = (a: string) => {
  if (a === undefined) {
    return false;
  }
  // If the regex matches, the string is invalid.
  return !XRegExp("\\p{Cc}|\\p{Cf}|\\p{Co}|\\p{Cn}|\\p{Zl}|\\p{Zp}", "A").test(
    a
  );
};

/**
 * Use regex to detect a text contains emoji or not.
 * @param a
 * @returns
 */
export const hasEmojiInText = (a: string) => {
  const regex = emojiRegex();
  return regex.test(a);
};

/**
 * Convert the headers to a normal object.
 * @param h
 * @param toLower
 * @returns
 */
export const headersToRecord = (h: Headers, toLower = true) => {
  const res: Record<string, string> = {};
  h.forEach((v, k) => {
    if (toLower) {
      res[k.toLowerCase()] = v;
    } else {
      res[k] = v;
    }
  });
  return res;
};

/**
 * If input is already a folder, returns it as is;
 * And if input is a file, returns its direname.
 * @param a
 * @returns
 */
export const getPathFolder = (a: string) => {
  if (a.endsWith("/")) {
    return a;
  }
  const b = path.posix.dirname(a);
  return b.endsWith("/") ? b : `${b}/`;
};

/**
 * If input is already a folder, returns its folder;
 * And if input is a file, returns its direname.
 * @param a
 * @returns
 */
export const getParentFolder = (a: string) => {
  const b = path.posix.dirname(a);
  if (b === "." || b === "/") {
    // the root
    return "/";
  }
  if (b.endsWith("/")) {
    return b;
  }
  return `${b}/`;
};

/**
 * https://stackoverflow.com/questions/54511144
 * @param a
 * @param delimiter
 * @returns
 */
export const setToString = (a: Set<string>, delimiter = ",") => {
  return [...a].join(delimiter);
};

export const extractSvgSub = (x: string, subEl = "rect") => {
  const parser = new window.DOMParser();
  const dom = parser.parseFromString(x, "image/svg+xml");
  const svg = dom.querySelector("svg")!;
  svg.setAttribute("viewbox", "0 0 10 10");
  return svg.innerHTML;
};

/**
 * https://stackoverflow.com/questions/18230217
 * @param min
 * @param max
 * @returns
 */
export const getRandomIntInclusive = (min: number, max: number) => {
  const randomBuffer = new Uint32Array(1);
  window.crypto.getRandomValues(randomBuffer);
  const randomNumber = randomBuffer[0] / (0xffffffff + 1);
  const min2 = Math.ceil(min);
  const max2 = Math.floor(max);
  return Math.floor(randomNumber * (max2 - min2 + 1)) + min2;
};

/**
 * Random buffer
 * @param byteLength
 * @returns
 */
export const getRandomArrayBuffer = (byteLength: number) => {
  const k = window.crypto.getRandomValues(new Uint8Array(byteLength));
  return bufferToArrayBuffer(k);
};

/**
 * https://stackoverflow.com/questions/958908
 * @param x
 * @returns
 */
export const reverseString = (x: string) => {
  return [...x].reverse().join("");
};

export interface SplitRange {
  partNum: number; // startting from 1
  start: number;
  end: number; // exclusive
}
export const getSplitRanges = (bytesTotal: number, bytesEachPart: number) => {
  const res: SplitRange[] = [];
  if (bytesEachPart >= bytesTotal) {
    res.push({
      partNum: 1,
      start: 0,
      end: bytesTotal,
    });
    return res;
  }
  const remainder = bytesTotal % bytesEachPart;
  const howMany =
    Math.floor(bytesTotal / bytesEachPart) + (remainder === 0 ? 0 : 1);
  for (let i = 0; i < howMany; ++i) {
    res.push({
      partNum: i + 1,
      start: bytesEachPart * i,
      end: Math.min(bytesEachPart * (i + 1), bytesTotal),
    });
  }
  return res;
};

/**
 * https://stackoverflow.com/questions/332422
 * @param obj anything
 * @returns string of the name of the object
 */
export const getTypeName = (obj: any) => {
  return Object.prototype.toString.call(obj).slice(8, -1);
};

/**
 * Startting from 1
 * @param x
 * @returns
 */
export const atWhichLevel = (x: string | undefined) => {
  if (
    x === undefined ||
    x === "" ||
    x === "." ||
    x === ".." ||
    x.startsWith("/")
  ) {
    throw Error(`do not know which level for ${x}`);
  }
  let y = x;
  if (x.endsWith("/")) {
    y = x.slice(0, -1);
  }
  return y.split("/").length;
};

export const checkHasSpecialCharForDir = (x: string) => {
  return /[?/\\]/.test(x);
};

export const unixTimeToStr = (x: number | undefined | null, hasMs = false) => {
  if (x === undefined || x === null || Number.isNaN(x)) {
    return undefined;
  }
  if (hasMs) {
    // 1716712162574 => '2024-05-26T16:29:22.574+08:00'
    return window.moment(x).toISOString(true);
  } else {
    // 1716712162574 => '2024-05-26T16:29:22+08:00'
    return window.moment(x).format() as string;
  }
};

/**
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples
 * @returns
 */
const getCircularReplacer = () => {
  const seen = new WeakSet();
  return (key: any, value: any) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) {
        return;
      }
      seen.add(value);
    }
    return value;
  };
};

/**
 * Convert "any" value to string.
 * @param x
 * @returns
 */
export const toText = (x: any) => {
  if (x === undefined || x === null) {
    return `${x}`;
  }
  if (typeof x === "string") {
    return x;
  }
  if (
    x instanceof String ||
    x instanceof Date ||
    typeof x === "number" ||
    typeof x === "bigint" ||
    typeof x === "boolean"
  ) {
    return `${x}`;
  }

  if (
    x instanceof Error ||
    (x?.stack &&
      x?.message &&
      typeof x.stack === "string" &&
      typeof x.message === "string")
  ) {
    return `ERROR! MESSAGE: ${x.message}, STACK: ${x.stack}`;
  }

  try {
    const y = JSON.stringify(x, getCircularReplacer(), 2);
    if (y !== undefined) {
      return y;
    }
    throw new Error("not jsonable");
  } catch {
    return `${x}`;
  }
};

/**
 * On Android the stat has bugs for folders. So we need a fixed version.
 * @param vault
 * @param path
 */
export const statFix = async (vault: Vault, path: string) => {
  const s = await vault.adapter.stat(path);
  if (s === undefined || s === null) {
    throw Error(`${path} doesn't exist cannot run stat`);
  }
  if (s.ctime === undefined || s.ctime === null || Number.isNaN(s.ctime)) {
    s.ctime = undefined as any; // force assignment
  }
  if (s.mtime === undefined || s.mtime === null || Number.isNaN(s.mtime)) {
    s.mtime = undefined as any; // force assignment
  }
  if (
    (s.size === undefined || s.size === null || Number.isNaN(s.size)) &&
    s.type === "folder"
  ) {
    s.size = 0;
  }
  return s;
};

export const isSpecialFolderNameToSkip = (
  x: string,
  more: string[] | undefined
) => {
  const specialFolders = [
    ".git",
    ".github",
    ".gitlab",
    ".svn",
    "node_modules",
    ".DS_Store",
    "__MACOSX ",
    "Icon\r", // https://superuser.com/questions/298785/icon-file-on-os-x-desktop
    "desktop.ini",
    "Desktop.ini",
    "thumbs.db",
    "Thumbs.db",
  ].concat(more !== undefined ? more : []);
  for (const iterator of specialFolders) {
    if (
      x === iterator ||
      x === `${iterator}/` ||
      x.endsWith(`/${iterator}`) ||
      x.endsWith(`/${iterator}/`)
    ) {
      return true;
    }
  }

  // microsoft tmp files...
  const p = x.split("/");
  if (p.length > 0) {
    const f = p[p.length - 1]; // file name
    if (f.startsWith("~$")) {
      const suffixList = ["doc", "docx", "ppt", "pptx", "xls", "xlsx"];
      for (const suffix of suffixList) {
        if (f.endsWith(`.${suffix}`)) {
          return true;
        }
      }
    }
  }

  return false;
};

/**
 *
 * @param x versionX
 * @param y versionY
 * @returns 1(x>y), 0(x==y), -1(x<y)
 */
export const compareVersion = (x: string | null, y: string | null) => {
  if (x === undefined || x === null) {
    return -1;
  }
  if (y === undefined || y === null) {
    return 1;
  }
  if (x === y) {
    return 0;
  }
  const [x1, x2, x3] = x.split(".").map((k) => Number(k));
  const [y1, y2, y3] = y.split(".").map((k) => Number(k));
  if (
    x1 > y1 ||
    (x1 === y1 && x2 > y2) ||
    (x1 === y1 && x2 === y2 && x3 > y3)
  ) {
    return 1;
  }
  return -1;
};

/**
 * https://stackoverflow.com/questions/19929641/how-to-append-an-html-string-to-a-documentfragment
 * To introduce some advanced html fragments.
 * @param string
 * @returns
 */
export const stringToFragment = (string: string) => {
  const wrapper = document.createElement("template");
  wrapper.innerHTML = string;
  return wrapper.content;
};

/**
 * https://stackoverflow.com/questions/39538473/using-settimeout-on-promise-chain
 * @param ms
 * @returns
 */
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * https://forum.obsidian.md/t/css-to-show-status-bar-on-mobile-devices/77185
 * @param op
 */
export const changeMobileStatusBar = (
  op: "enable" | "disable",
  oldAppContainerObserver?: MutationObserver
) => {
  const appContainer = document.getElementsByClassName("app-container")[0] as
    | HTMLElement
    | undefined;

  const statusbar = document.querySelector(
    ".is-mobile .app-container .status-bar"
  ) as HTMLElement | undefined;

  if (appContainer === undefined || statusbar === undefined) {
    // give up, exit
    console.warn(`give up watching appContainer for statusbar`);
    console.warn(`appContainer=${appContainer}, statusbar=${statusbar}`);
    return undefined;
  }

  if (op === "enable") {
    const callback = async (
      mutationList: MutationRecord[],
      observer: MutationObserver
    ) => {
      for (const mutation of mutationList) {
        // console.debug(mutation);
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          const k = mutation.addedNodes[0] as Element;
          if (
            k.className.contains("mobile-navbar") ||
            k.className.contains("mobile-toolbar")
          ) {
            // have to wait, otherwise the height is not correct??
            await delay(300);
            const height = window
              .getComputedStyle(k as Element)
              .getPropertyValue("height");

            statusbar.style.setProperty("display", "flex");
            statusbar.style.setProperty("margin-bottom", height);
          }
        }
      }
    };
    const observer = new MutationObserver(callback);
    observer.observe(appContainer, {
      attributes: false,
      childList: true,
      characterData: false,
      subtree: false,
    });

    try {
      // init, manual call
      const navBar = document.getElementsByClassName(
        "mobile-navbar"
      )[0] as HTMLElement;
      // thanks to community's solution
      const height = window.getComputedStyle(navBar).getPropertyValue("height");
      statusbar.style.setProperty("display", "flex");
      statusbar.style.setProperty("margin-bottom", height);
    } catch (e) {
      // skip
    }

    return observer;
  } else {
    if (oldAppContainerObserver !== undefined) {
      console.debug(`disconnect oldAppContainerObserver`);
      oldAppContainerObserver.disconnect();
      // biome-ignore lint/style/noParameterAssign: we want gc
      oldAppContainerObserver = undefined;
    }
    statusbar.style.removeProperty("display");
    statusbar.style.removeProperty("margin-bottom");
    return undefined;
  }
};

/**
 * https://github.com/remotely-save/remotely-save/issues/567
 * https://www.dropboxforum.com/t5/Dropbox-API-Support-Feedback/Case-Sensitivity-in-API-2/td-p/191279
 * @param entities
 */
export const fixEntityListCasesInplace = (entities: { keyRaw: string }[]) => {
  entities.sort((a, b) => a.keyRaw.length - b.keyRaw.length);
  // console.log(JSON.stringify(entities,null,2));

  const caseMapping: Record<string, string> = { "": "" };
  for (const e of entities) {
    // console.log(`looking for: ${JSON.stringify(e, null, 2)}`);

    let parentFolder = getParentFolder(e.keyRaw);
    if (parentFolder === "/") {
      parentFolder = "";
    }
    const parentFolderLower = parentFolder.toLocaleLowerCase();
    const segs = e.keyRaw.split("/");
    if (e.keyRaw.endsWith("/")) {
      // folder
      if (caseMapping.hasOwnProperty(parentFolderLower)) {
        const newKeyRaw = `${caseMapping[parentFolderLower]}${segs
          .slice(-2)
          .join("/")}`;
        caseMapping[newKeyRaw.toLocaleLowerCase()] = newKeyRaw;
        e.keyRaw = newKeyRaw;
        // console.log(JSON.stringify(caseMapping,null,2));
      } else {
        throw Error(`${parentFolder} doesn't have cases record??`);
      }
    } else {
      // file
      if (caseMapping.hasOwnProperty(parentFolderLower)) {
        const newKeyRaw = `${caseMapping[parentFolderLower]}${segs
          .slice(-1)
          .join("/")}`;
        e.keyRaw = newKeyRaw;
      } else {
        throw Error(`${parentFolder} doesn't have cases record??`);
      }
    }
  }

  return entities;
};

/**
 * https://stackoverflow.com/questions/1248302/how-to-get-the-size-of-a-javascript-object
 * @param object
 * @returns bytes
 */
export const roughSizeOfObject = (object: any) => {
  const objectList: any[] = [];
  const stack = [object];
  let bytes = 0;

  while (stack.length) {
    const value = stack.pop();

    switch (typeof value) {
      case "boolean":
        bytes += 4;
        break;
      case "string":
        bytes += value.length * 2;
        break;
      case "number":
        bytes += 8;
        break;
      case "object":
        if (!objectList.includes(value)) {
          objectList.push(value);
          for (const prop in value) {
            if (value.hasOwnProperty(prop)) {
              stack.push(value[prop]);
            }
          }
        }
        break;
    }
  }
  return bytes;
};

export const splitFileSizeToChunkRanges = (
  totalSize: number,
  chunkSize: number
) => {
  if (totalSize < 0) {
    throw Error(`totalSize should not be negative`);
  }
  if (chunkSize <= 0) {
    throw Error(`chunkSize should not be negative or zero`);
  }

  if (totalSize === 0) {
    return [];
  }
  if (totalSize <= chunkSize) {
    return [{ start: 0, end: totalSize - 1 }];
  }

  const res: { start: number; end: number }[] = [];

  const blocksCount = Math.ceil((totalSize * 1.0) / chunkSize);

  for (let i = 0; i < blocksCount; ++i) {
    res.push({
      start: i * chunkSize,
      end: Math.min((i + 1) * chunkSize - 1, totalSize - 1),
    });
  }
  return res;
};

export const getSha1 = async (x: ArrayBuffer, stringify: "base64" | "hex") => {
  const y = await window.crypto.subtle.digest("SHA-1", x);

  if (stringify === "base64") {
    return arrayBufferToBase64(y);
  } else if (stringify === "hex") {
    return arrayBufferToHex(y);
  }
  throw Error(`not supported stringify option = ${stringify}`);
};

/**
 * https://learn.microsoft.com/en-us/windows/win32/fileio/naming-a-file#naming-conventions
 * https://support.microsoft.com/en-us/office/restrictions-and-limitations-in-onedrive-and-sharepoint-64883a5d-228e-48f5-b3d2-eb39e07630fa#invalidcharacters
 */
export const checkValidName = (x: string) => {
  if (x === undefined || x === "") {
    // what??
    return {
      reason: "empty",
      result: false,
    };
  }

  // The following reserved characters:
  const invalidChars = '*"<>:|?'.split("");
  for (const c of invalidChars) {
    if (x.includes(c)) {
      return {
        reason: `reserved character: ${c},name: ${x}`,
        result: false,
      };
    }
  }

  // directory component
  for (const c of [".", ".."]) {
    if (
      x === c ||
      x.endsWith(`/${c}`) ||
      x.startsWith(`${c}/`) ||
      x.includes(`/${c}/`)
    ) {
      return {
        reason: `directory being ${c}`,
        result: false,
      };
    }
  }

  // reserved file names
  const reservedNames = [
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM0",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "COM¹",
    "COM²",
    "COM³",
    "LPT0",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
    "LPT¹",
    "LPT²",
    "LPT³",
  ];
  for (const f of reservedNames) {
    if (
      x === f ||
      x.startsWith(`${f}.`) ||
      x.startsWith(`${f}/`) ||
      x.includes(`/${f}/`) ||
      x.endsWith(`/${f}`) ||
      x.includes(`/${f}.`)
    ) {
      return {
        reason: `reserved folder/file name: ${f}`,
        result: false,
      };
    }
  }

  // Do not end a file or directory name with a space or a period.
  if (
    x.endsWith(" ") ||
    x.endsWith(".") ||
    x.includes(" /") ||
    x.includes("./")
  ) {
    return {
      reason: `folder/file name ending with a space or a period`,
      result: false,
    };
  }

  return {
    reason: "ok",
    result: true,
  };
};
