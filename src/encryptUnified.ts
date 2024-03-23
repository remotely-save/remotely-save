import { CipherMethodType } from "./baseTypes";
import * as openssl from "./encryptOpenSSL";
import { isVaildText } from "./misc";

export class Cipher {
  readonly password: string;
  readonly method: CipherMethodType;
  constructor(password: string, method: CipherMethodType) {
    this.password = password ?? "";
    this.method = method;
  }

  isPasswordEmpty() {
    return this.password === "";
  }

  async encryptContent(content: ArrayBuffer) {
    if (this.password === "") {
      return content;
    }
    if (this.method === "openssl-base64") {
      return await openssl.encryptArrayBuffer(content, this.password);
    } else if (this.method === "rclone-base64") {
      throw Error("not implemented yet");
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async decryptContent(content: ArrayBuffer) {
    if (this.password === "") {
      return content;
    }
    if (this.method === "openssl-base64") {
      return await openssl.decryptArrayBuffer(content, this.password);
    } else if (this.method === "rclone-base64") {
      throw Error("not implemented yet");
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async encryptName(name: string) {
    if (this.password === "") {
      return name;
    }
    if (this.method === "openssl-base64") {
      return await openssl.encryptStringToBase64url(name, this.password);
    } else if (this.method === "rclone-base64") {
      throw Error("not implemented yet");
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  async decryptName(name: string) {
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
      throw Error("not implemented yet");
    } else {
      throw Error(`not supported encrypt method=${this.method}`);
    }
  }

  getSizeFromOrigToEnc(x: number) {
    if (this.password === "") {
      return x;
    }
    if (this.method === "openssl-base64") {
      return openssl.getSizeFromOrigToEnc(x);
    } else if (this.method === "rclone-base64") {
      throw Error("not implemented yet");
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
