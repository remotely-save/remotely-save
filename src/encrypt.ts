import * as crypto from "crypto";
import * as base32 from "hi-base32";
import { bufferToArrayBuffer, arrayBufferToBuffer } from "./misc";

const DEFAULT_ITER = 10000;

export const encryptBuffer = (
  buf: Buffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const salt = crypto.randomBytes(8);
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    rounds,
    32 + 16,
    "sha256"
  );
  const key = derivedKey.slice(0, 32);
  const iv = derivedKey.slice(32, 32 + 16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.write(buf);
  cipher.end();
  const encrypted = cipher.read();
  const res = Buffer.concat([Buffer.from("Salted__"), salt, encrypted]);
  return res;
};

export const decryptBuffer = (
  buf: Buffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const prefix = buf.slice(0, 8);
  const salt = buf.slice(8, 16);
  const derivedKey = crypto.pbkdf2Sync(
    password,
    salt,
    rounds,
    32 + 16,
    "sha256"
  );
  const key = derivedKey.slice(0, 32);
  const iv = derivedKey.slice(32, 32 + 16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.write(buf.slice(16));
  decipher.end();
  const decrypted = decipher.read();
  return decrypted as Buffer;
};

export const encryptArrayBuffer = (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return bufferToArrayBuffer(
    encryptBuffer(arrayBufferToBuffer(arrBuf), password, rounds)
  );
};

export const decryptArrayBuffer = (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return bufferToArrayBuffer(
    decryptBuffer(arrayBufferToBuffer(arrBuf), password, rounds)
  );
};

export const encryptStringToBase32 = (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return base32.encode(encryptBuffer(Buffer.from(text), password, rounds));
};

export const decryptBase32ToString = (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return decryptBuffer(
    Buffer.from(base32.decode.asBytes(text)),
    password,
    rounds
  ).toString();
};
