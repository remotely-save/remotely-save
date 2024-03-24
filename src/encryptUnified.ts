import { CipherMethodType } from "./baseTypes";
import * as openssl from "./encryptOpenSSL";
import * as rclone from "./encryptRClone";
import { isVaildText } from "./misc";

export class Cipher {
  readonly password: string;
  readonly method: CipherMethodType;
  cipherRClone?: rclone.CipherRclone;
  constructor(password: string, method: CipherMethodType) {
    this.password = password ?? "";
    this.method = method;

    if (method === "rclone-base64") {
      this.cipherRClone = new rclone.CipherRclone(password, 5);
    }
  }

  closeResources() {
    if (this.method === "rclone-base64" && this.cipherRClone !== undefined) {
      this.cipherRClone.closeResources();
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

  async encryptContent(content: ArrayBuffer) {
    // console.debug("start encryptContent");
    if (this.password === "") {
      return content;
    }
    if (this.method === "openssl-base64") {
      return await openssl.encryptArrayBuffer(content, this.password);
    } else if (this.method === "rclone-base64") {
      return await this.cipherRClone!.encryptContentByCallingWorker(content);
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async decryptContent(content: ArrayBuffer) {
    // console.debug("start decryptContent");
    if (this.password === "") {
      return content;
    }
    if (this.method === "openssl-base64") {
      return await openssl.decryptArrayBuffer(content, this.password);
    } else if (this.method === "rclone-base64") {
      return await this.cipherRClone!.decryptContentByCallingWorker(content);
    } else {
      throw Error(`not supported decrypt method=${this.method}`);
    }
  }

  async encryptName(name: string) {
    // console.debug("start encryptName");
    if (this.password === "") {
      return name;
    }
    if (this.method === "openssl-base64") {
      return await openssl.encryptStringToBase64url(name, this.password);
    } else if (this.method === "rclone-base64") {
      return await this.cipherRClone!.encryptNameByCallingWorker(name);
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async decryptName(name: string) {
    // console.debug("start decryptName");
    if (this.password === "") {
      return name;
    }
    if (this.method === "openssl-base64") {
      if (name.startsWith(openssl.MAGIC_ENCRYPTED_PREFIX_BASE32)) {
        // backward compitable with the openssl-base32
        try {
          const res = await openssl.decryptBase32ToString(name, this.password);
          if (isVaildText(res)) {
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
          if (isVaildText(res)) {
            return res;
          } else {
            throw Error(`cannot decrypt name=${name}`);
          }
        } catch (error) {
          throw Error(`cannot decrypt name=${name}`);
        }
      }
    } else if (this.method === "rclone-base64") {
      return await this.cipherRClone!.decryptNameByCallingWorker(name);
    } else {
      throw Error(`not supported decrypt method=${this.method}`);
    }
  }

  getSizeFromOrigToEnc(x: number) {
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

  /**
   * quick guess, no actual decryption here
   * @param name
   * @returns
   */
  static isLikelyEncryptedName(name: string): boolean {
    if (
      name.startsWith(openssl.MAGIC_ENCRYPTED_PREFIX_BASE32) ||
      name.startsWith(openssl.MAGIC_ENCRYPTED_PREFIX_BASE64URL)
    ) {
      return true;
    }
    return false;
  }
}
