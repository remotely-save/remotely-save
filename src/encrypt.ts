import { randomBytes, createDecipheriv, createCipheriv } from "crypto";
import { pbkdf2, createSHA256 } from "hash-wasm";
import { promisify } from "util";
import * as base32 from "hi-base32";
import { bufferToArrayBuffer, arrayBufferToBuffer } from "./misc";

const DEFAULT_ITER = 10000;

export const encryptBuffer = async (
  buf: Buffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const salt = await promisify(randomBytes)(8);
  const derivedKey = await pbkdf2({
    password: password,
    salt: salt,
    iterations: rounds,
    hashLength: 32 + 16,
    hashFunction: createSHA256(),
    outputType: "binary",
  });
  const key = derivedKey.slice(0, 32);
  const iv = derivedKey.slice(32, 32 + 16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  cipher.write(buf);
  cipher.end();
  const encrypted = cipher.read();
  const res = Buffer.concat([Buffer.from("Salted__"), salt, encrypted]);
  return res;
};

export const decryptBuffer = async (
  buf: Buffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  const prefix = buf.slice(0, 8);
  const salt = buf.slice(8, 16);
  const derivedKey = await pbkdf2({
    password: password,
    salt: salt,
    iterations: rounds,
    hashLength: 32 + 16,
    hashFunction: createSHA256(),
    outputType: "binary",
  });
  const key = derivedKey.slice(0, 32);
  const iv = derivedKey.slice(32, 32 + 16);
  const decipher = createDecipheriv("aes-256-cbc", key, iv);
  decipher.write(buf.slice(16));
  decipher.end();
  const decrypted = decipher.read();
  return decrypted as Buffer;
};

export const encryptArrayBuffer = async (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return bufferToArrayBuffer(
    await encryptBuffer(arrayBufferToBuffer(arrBuf), password, rounds)
  );
};

export const decryptArrayBuffer = async (
  arrBuf: ArrayBuffer,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return bufferToArrayBuffer(
    await decryptBuffer(arrayBufferToBuffer(arrBuf), password, rounds)
  );
};

export const encryptStringToBase32 = async (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return base32.encode(
    await encryptBuffer(Buffer.from(text), password, rounds)
  );
};

export const decryptBase32ToString = async (
  text: string,
  password: string,
  rounds: number = DEFAULT_ITER
) => {
  return (
    await decryptBuffer(
      Buffer.from(base32.decode.asBytes(text)),
      password,
      rounds
    )
  ).toString();
};
