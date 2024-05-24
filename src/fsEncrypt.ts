import type { CipherMethodType, Entity } from "./baseTypes";
import * as openssl from "./encryptOpenSSL";
import * as rclone from "./encryptRClone";
import { isVaildText } from "./misc";

import cloneDeep from "lodash/cloneDeep";
import { FakeFs } from "./fsAll";

/**
 * quick guess, no actual decryption here
 * @param name
 * @returns
 */
function isLikelyOpenSSLEncryptedName(name: string): boolean {
  if (
    name.startsWith(openssl.MAGIC_ENCRYPTED_PREFIX_BASE32) ||
    name.startsWith(openssl.MAGIC_ENCRYPTED_PREFIX_BASE64URL)
  ) {
    return true;
  }
  return false;
}

/**
 * quick guess, no actual decryption here
 * @param name
 * @returns
 */
function isLikelyEncryptedName(name: string): boolean {
  return isLikelyOpenSSLEncryptedName(name);
}

/**
 * quick guess, no actual decryption here, only openssl can be guessed here
 * @param name
 * @returns
 */
function isLikelyEncryptedNameNotMatchMethod(
  name: string,
  method: CipherMethodType
): boolean {
  if (isLikelyOpenSSLEncryptedName(name) && method !== "openssl-base64") {
    return true;
  }
  if (!isLikelyOpenSSLEncryptedName(name) && method === "openssl-base64") {
    return true;
  }
  return false;
}

export interface PasswordCheckType {
  ok: boolean;
  reason:
    | "empty_remote"
    | "unknown_encryption_method"
    | "remote_encrypted_local_no_password"
    | "password_matched"
    | "password_or_method_not_matched_or_remote_not_encrypted"
    | "likely_no_password_both_sides"
    | "encryption_method_not_matched";
}

/**
 * Useful if isPasswordEmpty()
 */
function copyEntityAndCopyKeyEncSizeEnc(entity: Entity) {
  const res = cloneDeep(entity);
  res["keyEnc"] = res["keyRaw"];
  res["sizeEnc"] = res["sizeRaw"];
  return res;
}

export class FakeFsEncrypt extends FakeFs {
  innerFs: FakeFs;
  readonly password: string;
  readonly method: CipherMethodType;
  cipherRClone?: rclone.CipherRclone;
  cacheMapOrigToEnc: Record<string, string>;
  hasCacheMap: boolean;
  kind: string;

  constructor(innerFs: FakeFs, password: string, method: CipherMethodType) {
    super();
    this.innerFs = innerFs;
    this.password = password ?? "";
    this.method = method;
    this.cacheMapOrigToEnc = {};
    this.hasCacheMap = false;

    this.kind = `encrypt(${this.innerFs.kind},${
      this.password !== "" ? method : "no password"
    })`;

    if (method === "rclone-base64") {
      this.cipherRClone = new rclone.CipherRclone(password, 5);
    }
  }

  isPasswordEmpty() {
    return this.password === "";
  }

  isFolderAware() {
    if (this.method === "openssl-base64") {
      return false;
    }
    if (this.method === "rclone-base64") {
      return true;
    }
    throw Error(`no idea about isFolderAware for method=${this.method}`);
  }

  async isPasswordOk(): Promise<PasswordCheckType> {
    const innerWalkResult = await this.walkPartial();

    if (innerWalkResult === undefined || innerWalkResult.length === 0) {
      // remote empty
      return {
        ok: true,
        reason: "empty_remote",
      };
    }
    const santyCheckKey = innerWalkResult[0].keyRaw;

    if (this.isPasswordEmpty()) {
      // TODO: no way to distinguish remote rclone encrypted
      //       if local has no password??
      if (isLikelyEncryptedName(santyCheckKey)) {
        return {
          ok: false,
          reason: "remote_encrypted_local_no_password",
        };
      } else {
        return {
          ok: true,
          reason: "likely_no_password_both_sides",
        };
      }
    } else {
      if (this.method === "unknown") {
        return {
          ok: false,
          reason: "unknown_encryption_method",
        };
      }
      if (isLikelyEncryptedNameNotMatchMethod(santyCheckKey, this.method)) {
        return {
          ok: false,
          reason: "encryption_method_not_matched",
        };
      }
      try {
        const k = await this._decryptName(santyCheckKey);
        if (k === undefined) {
          throw Error(`decryption failed`);
        }
        return {
          ok: true,
          reason: "password_matched",
        };
      } catch (error) {
        return {
          ok: false,
          reason: "password_or_method_not_matched_or_remote_not_encrypted",
        };
      }
    }
  }

  async walk(): Promise<Entity[]> {
    const innerWalkResult = await this.innerFs.walk();
    return await this._dealWithWalk(innerWalkResult);
  }

  async walkPartial(): Promise<Entity[]> {
    const innerWalkResult = await this.innerFs.walkPartial();
    return await this._dealWithWalk(innerWalkResult);
  }

  async _dealWithWalk(innerWalkResult: Entity[]): Promise<Entity[]> {
    const res: Entity[] = [];

    if (this.isPasswordEmpty()) {
      for (const innerEntity of innerWalkResult) {
        res.push(copyEntityAndCopyKeyEncSizeEnc(innerEntity));
        this.cacheMapOrigToEnc[innerEntity.key!] = innerEntity.key!;
      }
      this.hasCacheMap = true;
      return res;
    } else {
      for (const innerEntity of innerWalkResult) {
        const key = await this._decryptName(innerEntity.keyRaw);
        const size = key.endsWith("/") ? 0 : undefined;
        res.push({
          key: key,
          keyRaw: innerEntity.keyRaw,
          keyEnc: innerEntity.key!,
          mtimeCli: innerEntity.mtimeCli,
          mtimeSvr: innerEntity.mtimeSvr,
          size: size,
          sizeEnc: innerEntity.size!,
          sizeRaw: innerEntity.sizeRaw,
          hash: undefined,
          synthesizedFolder: innerEntity.synthesizedFolder,
        });

        this.cacheMapOrigToEnc[key] = innerEntity.keyRaw;
      }
      this.hasCacheMap = true;
      return res;
    }
  }

  async stat(key: string): Promise<Entity> {
    if (!this.hasCacheMap) {
      throw new Error("You have to build the cacheMap firstly for stat");
    }
    const keyEnc = this.cacheMapOrigToEnc[key];
    if (keyEnc === undefined) {
      throw new Error(`no encrypted key ${key} before!`);
    }

    const innerEntity = await this.innerFs.stat(keyEnc);
    if (this.isPasswordEmpty()) {
      return copyEntityAndCopyKeyEncSizeEnc(innerEntity);
    } else {
      return {
        key: key,
        keyRaw: innerEntity.keyRaw,
        keyEnc: innerEntity.key!,
        mtimeCli: innerEntity.mtimeCli,
        mtimeSvr: innerEntity.mtimeSvr,
        size: undefined,
        sizeEnc: innerEntity.size!,
        sizeRaw: innerEntity.sizeRaw,
        hash: undefined,
        synthesizedFolder: innerEntity.synthesizedFolder,
      };
    }
  }

  async mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity> {
    if (!this.hasCacheMap) {
      throw new Error("You have to build the cacheMap firstly for mkdir");
    }

    if (!key.endsWith("/")) {
      throw new Error(`should not call mkdir on ${key}`);
    }

    let keyEnc = this.cacheMapOrigToEnc[key];
    if (keyEnc === undefined) {
      if (this.isPasswordEmpty()) {
        keyEnc = key;
      } else {
        keyEnc = await this._encryptName(key);
      }
      this.cacheMapOrigToEnc[key] = keyEnc;
    }

    if (this.isPasswordEmpty() || this.isFolderAware()) {
      const innerEntity = await this.innerFs.mkdir(keyEnc, mtime, ctime);
      return copyEntityAndCopyKeyEncSizeEnc(innerEntity);
    } else {
      const now = Date.now();
      let content = new ArrayBuffer(0);
      if (!this.innerFs.allowEmptyFile()) {
        content = new ArrayBuffer(1);
      }
      const innerEntity = await this.innerFs.writeFile(
        keyEnc,
        content,
        mtime ?? now,
        ctime ?? now
      );
      return {
        key: key,
        keyRaw: innerEntity.keyRaw,
        keyEnc: innerEntity.key!,
        mtimeCli: innerEntity.mtimeCli,
        mtimeSvr: innerEntity.mtimeSvr,
        size: 0,
        sizeEnc: innerEntity.size!,
        sizeRaw: innerEntity.sizeRaw,
        hash: undefined,
        synthesizedFolder: innerEntity.synthesizedFolder,
      };
    }
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    if (!this.hasCacheMap) {
      throw new Error("You have to build the cacheMap firstly for readFile");
    }
    let keyEnc = this.cacheMapOrigToEnc[key];
    if (keyEnc === undefined) {
      if (this.isPasswordEmpty()) {
        keyEnc = key;
      } else {
        keyEnc = await this._encryptName(key);
      }
      this.cacheMapOrigToEnc[key] = keyEnc;
    }

    if (this.isPasswordEmpty()) {
      const innerEntity = await this.innerFs.writeFile(
        keyEnc,
        content,
        mtime,
        ctime
      );
      return copyEntityAndCopyKeyEncSizeEnc(innerEntity);
    } else {
      const contentEnc = await this._encryptContent(content);
      const innerEntity = await this.innerFs.writeFile(
        keyEnc,
        contentEnc,
        mtime,
        ctime
      );
      return {
        key: key,
        keyRaw: innerEntity.keyRaw,
        keyEnc: innerEntity.key!,
        mtimeCli: innerEntity.mtimeCli,
        mtimeSvr: innerEntity.mtimeSvr,
        size: undefined,
        sizeEnc: innerEntity.size!,
        sizeRaw: innerEntity.sizeRaw,
        hash: undefined,
        synthesizedFolder: innerEntity.synthesizedFolder,
      };
    }
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    if (!this.hasCacheMap) {
      throw new Error("You have to build the cacheMap firstly for readFile");
    }
    const keyEnc = this.cacheMapOrigToEnc[key];
    if (keyEnc === undefined) {
      throw new Error(`no encrypted key ${key} before! cannot readFile`);
    }

    const contentEnc = await this.innerFs.readFile(keyEnc);
    if (this.isPasswordEmpty()) {
      return contentEnc;
    } else {
      const res = await this._decryptContent(contentEnc);
      return res;
    }
  }

  async rm(key: string): Promise<void> {
    if (!this.hasCacheMap) {
      throw new Error("You have to build the cacheMap firstly for rm");
    }
    const keyEnc = this.cacheMapOrigToEnc[key];
    if (keyEnc === undefined) {
      throw new Error(`no encrypted key ${key} before! cannot rm`);
    }
    return await this.innerFs.rm(keyEnc);
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    return await this.innerFs.checkConnect(callbackFunc);
  }

  async closeResources() {
    if (this.method === "rclone-base64" && this.cipherRClone !== undefined) {
      this.cipherRClone.closeResources();
    }
  }

  async encryptEntity(input: Entity): Promise<Entity> {
    if (input.key === undefined) {
      // input.key should always have value
      throw Error(`input ${input.keyRaw} is abnormal without key`);
    }

    if (this.isPasswordEmpty()) {
      return copyEntityAndCopyKeyEncSizeEnc(input);
    }

    // below is for having password
    const local = cloneDeep(input);
    if (local.sizeEnc === undefined && local.size !== undefined) {
      // it's not filled yet, we fill it
      // local.size is possibly undefined if it's "prevSync" Entity
      // but local.key should always have value
      local.sizeEnc = this._getSizeFromOrigToEnc(local.size);
    }

    if (local.keyEnc === undefined || local.keyEnc === "") {
      let keyEnc = this.cacheMapOrigToEnc[input.key];
      if (keyEnc !== undefined && keyEnc !== "" && keyEnc !== local.key) {
        // we can reuse remote encrypted key if any
        local.keyEnc = keyEnc;
      } else {
        // we assign a new encrypted key because of no remote
        keyEnc = await this._encryptName(input.key);
        local.keyEnc = keyEnc;
        // remember to add back to cache!
        this.cacheMapOrigToEnc[input.key] = keyEnc;
      }
    }
    return local;
  }

  async _encryptContent(content: ArrayBuffer) {
    // console.debug("start encryptContent");
    if (this.password === "") {
      return content;
    }
    if (this.method === "openssl-base64") {
      const res = await openssl.encryptArrayBuffer(content, this.password);
      if (res === undefined) {
        throw Error(`cannot encrypt content`);
      }
      return res;
    } else if (this.method === "rclone-base64") {
      const res =
        await this.cipherRClone!.encryptContentByCallingWorker(content);
      if (res === undefined) {
        throw Error(`cannot encrypt content`);
      }
      return res;
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async _decryptContent(content: ArrayBuffer) {
    // console.debug("start decryptContent");
    if (this.password === "") {
      return content;
    }
    if (this.method === "openssl-base64") {
      const res = await openssl.decryptArrayBuffer(content, this.password);
      if (res === undefined) {
        throw Error(`cannot decrypt content`);
      }
      return res;
    } else if (this.method === "rclone-base64") {
      const res =
        await this.cipherRClone!.decryptContentByCallingWorker(content);
      if (res === undefined) {
        throw Error(`cannot decrypt content`);
      }
      return res;
    } else {
      throw Error(`not supported decrypt method=${this.method}`);
    }
  }

  async _encryptName(name: string) {
    // console.debug("start encryptName");
    if (this.password === "") {
      return name;
    }
    if (this.method === "openssl-base64") {
      const res = await openssl.encryptStringToBase64url(name, this.password);
      if (res === undefined) {
        throw Error(`cannot encrypt name=${name}`);
      }
      return res;
    } else if (this.method === "rclone-base64") {
      const res = await this.cipherRClone!.encryptNameByCallingWorker(name);
      if (res === undefined) {
        throw Error(`cannot encrypt name=${name}`);
      }
      return res;
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async _decryptName(name: string): Promise<string> {
    // console.debug("start decryptName");
    if (this.password === "") {
      return name;
    }
    if (this.method === "openssl-base64") {
      if (name.startsWith(openssl.MAGIC_ENCRYPTED_PREFIX_BASE32)) {
        // backward compitable with the openssl-base32
        try {
          const res = await openssl.decryptBase32ToString(name, this.password);
          if (res !== undefined && isVaildText(res)) {
            return res;
          } else {
            throw Error(`cannot decrypt name=${name}`);
          }
        } catch (error) {
          throw Error(`cannot decrypt name=${name}`);
        }
      } else if (name.startsWith(openssl.MAGIC_ENCRYPTED_PREFIX_BASE64URL)) {
        try {
          const res = await openssl.decryptBase64urlToString(
            name,
            this.password
          );
          if (res !== undefined && isVaildText(res)) {
            return res;
          } else {
            throw Error(`cannot decrypt name=${name}`);
          }
        } catch (error) {
          throw Error(`cannot decrypt name=${name}`);
        }
      } else {
        throw Error(
          `method=${this.method} but the name=${name}, likely mismatch`
        );
      }
    } else if (this.method === "rclone-base64") {
      const res = await this.cipherRClone!.decryptNameByCallingWorker(name);
      if (res === undefined) {
        throw Error(`cannot decrypt name=${name}`);
      }
      return res;
    } else {
      throw Error(`not supported decrypt method=${this.method}`);
    }
  }

  _getSizeFromOrigToEnc(x: number) {
    if (this.password === "") {
      return x;
    }
    if (this.method === "openssl-base64") {
      return openssl.getSizeFromOrigToEnc(x);
    } else if (this.method === "rclone-base64") {
      return rclone.getSizeFromOrigToEnc(x);
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async getUserDisplayName(): Promise<string> {
    return await this.innerFs.getUserDisplayName();
  }

  async revokeAuth(): Promise<any> {
    return await this.innerFs.revokeAuth();
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
