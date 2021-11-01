import * as CryptoJS from "crypto-js";
import * as base32 from "hi-base32";
import {
  bufferToArrayBuffer,
  arrayBufferToBuffer,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from "./misc";

const DEFAULT_ITER = 10000;

export const encryptWordArray = (
  wa: CryptoJS.lib.WordArray,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const prefix = CryptoJS.enc.Utf8.parse("Salted__");
  const salt = CryptoJS.lib.WordArray.random(8);
  const derivedKey = CryptoJS.PBKDF2(password, salt, {
    keySize: 32 + 16,
    iterations: rounds,
    hasher: CryptoJS.algo.SHA256,
  });
  const key = CryptoJS.lib.WordArray.create(derivedKey.words.slice(0, 32 / 4));
  const iv = CryptoJS.lib.WordArray.create(
    derivedKey.words.slice(32 / 4, (32 + 16) / 4)
  );
  const encrypted = CryptoJS.AES.encrypt(wa, key, { iv: iv }).ciphertext;
  const res = CryptoJS.lib.WordArray.create()
    .concat(prefix)
    .concat(salt)
    .concat(encrypted);
  return res;
};

export const decryptWordArray = (
  wa: CryptoJS.lib.WordArray,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const prefix = CryptoJS.lib.WordArray.create(wa.words.slice(0, 8 / 4));

  const salt = CryptoJS.lib.WordArray.create(
    wa.words.slice(8 / 4, (8 + 8) / 4)
  );
  const derivedKey = CryptoJS.PBKDF2(password, salt, {
    keySize: 32 + 16,
    iterations: rounds,
    hasher: CryptoJS.algo.SHA256,
  });
  const key = CryptoJS.lib.WordArray.create(derivedKey.words.slice(0, 32 / 4));
  const iv = CryptoJS.lib.WordArray.create(
    derivedKey.words.slice(32 / 4, 32 / 4 + 16 / 4)
  );
  const decrypted = CryptoJS.AES.decrypt(
    CryptoJS.lib.CipherParams.create({
      ciphertext: CryptoJS.lib.WordArray.create(wa.words.slice((8 + 8) / 4)),
    }),
    key,
    { iv: iv }
  );
  return decrypted;
};

export const encryptArrayBuffer = (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const b64 = arrayBufferToBase64(arrBuf);
  const wa = CryptoJS.enc.Base64.parse(b64);
  const enc = encryptWordArray(wa, password, rounds);
  const resb64 = CryptoJS.enc.Base64.stringify(enc);
  const res = base64ToArrayBuffer(resb64);
  return res;
};

export const decryptArrayBuffer = (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const b64 = arrayBufferToBase64(arrBuf);
  const wa = CryptoJS.enc.Base64.parse(b64);
  const dec = decryptWordArray(wa, password, rounds);
  const resb64 = CryptoJS.enc.Base64.stringify(dec);
  const res = base64ToArrayBuffer(resb64);
  return res;
};

export const encryptStringToBase32 = (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const wa = CryptoJS.enc.Utf8.parse(text);
  const enc = encryptWordArray(wa, password, rounds);
  const enctext = CryptoJS.enc.Base64.stringify(enc);
  const res = base32.encode(base64ToArrayBuffer(enctext));
  return res;
};

export const decryptBase32ToString = (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const enc = Buffer.from(base32.decode.asBytes(text)).toString("base64");
  const wa = CryptoJS.enc.Base64.parse(enc);
  const dec = decryptWordArray(wa, password, rounds);
  const dectext = CryptoJS.enc.Utf8.stringify(dec);
  return dectext;
};
