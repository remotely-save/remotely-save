import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  decryptArrayBuffer,
  decryptBase32ToString,
  encryptArrayBuffer,
  encryptStringToBase32,
  encryptStringToBase64url,
  getSizeFromEncToOrig,
  getSizeFromOrigToEnc,
} from "../src/encryptOpenSSL";
import { base64ToBase64url, bufferToArrayBuffer } from "../src/misc";

describe("Encryption OpenSSL tests", () => {
  beforeEach(() => {
    global.window = {
      crypto: require("crypto").webcrypto,
    } as any;
  });

  it("should encrypt string", async () => {
    const k = "dkjdhkfhdkjgsdklxxd";
    const password = "hey";
    assert.notEqual(await encryptStringToBase32(k, password), k);
  });

  it("should encrypt string and return different results each time", async () => {
    const k = "dkjdhkfhdkjgsdklxxd";
    const password = "hey";
    const res1 = await encryptStringToBase32(k, password);
    const res2 = await encryptStringToBase32(k, password);
    assert.notEqual(res1, res2);
  });

  it("should raise error using different password", async () => {
    const k = "secret text";
    const password = "hey";
    const password2 = "hey2";
    const enc = await encryptStringToBase32(k, password);
    await assert.rejects(decryptBase32ToString(enc, password2));
  });

  it("should encrypt and decrypt string and get the same result returned", async () => {
    const k = "jfkkjkjbce7983ycdeknkkjckooAIUHIDIBIE((*BII)njD/d/dd/d/sjxhux";
    const password = "hfiuibec989###oiu982bj1`";
    const enc = await encryptStringToBase32(k, password);
    // console.log(enc);
    const dec = await decryptBase32ToString(enc, password);
    // console.log(dec);
    assert.equal(dec, k);
  });

  it("should encrypt text file and get the same result as openssl", async () => {
    const fileContent = (
      await fs.readFileSync(
        path.join(__dirname, "static_assets", "sometext.txt")
      )
    ).toString("utf-8");
    const password = "somepassword";
    const saltHex = "8302F586FAB491EC";
    const enc = await encryptStringToBase64url(
      fileContent,
      password,
      undefined,
      saltHex
    );

    // two command returns same result:
    // cat ./sometext.txt | openssl enc -p -aes-256-cbc -S 8302F586FAB491EC -pbkdf2 -iter 20000 -base64 -pass pass:somepassword
    // openssl enc -p -aes-256-cbc -S 8302F586FAB491EC -pbkdf2 -iter 20000 -base64 -pass pass:somepassword -in ./sometext.txt
    const opensslBase64Res =
      "U2FsdGVkX1+DAvWG+rSR7BPXMnlvSSVGMdjsx7kE1CTH+28P+yAZRdDGgFWMGkMd";
    // we output base32, so we need some transformation
    const opensslBase64urlRes = base64ToBase64url(opensslBase64Res);

    assert.equal(enc, opensslBase64urlRes);
  });

  it("should encrypt binary file and get the same result as openssl", async () => {
    const testFolder = path.join(__dirname, "static_assets", "mona_lisa");
    const testFileName =
      "1374px-Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg";
    const fileArrBuf = bufferToArrayBuffer(
      await fs.readFileSync(path.join(testFolder, testFileName))
    );
    const password = "somepassword";
    const saltHex = "8302F586FAB491EC";
    const enc = await encryptArrayBuffer(
      fileArrBuf,
      password,
      undefined,
      saltHex
    );
    const opensslArrBuf = bufferToArrayBuffer(
      await fs.readFileSync(path.join(testFolder, testFileName + ".enc"))
    );

    // openssl enc -p -aes-256-cbc -S 8302F586FAB491EC -pbkdf2 -iter 20000 -pass pass:somepassword -in mona_lisa/1374px-Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg -out mona_lisa/1374px-Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg.enc

    assert.ok(Buffer.from(enc).equals(Buffer.from(opensslArrBuf)));
  });

  it("should encrypt binary file not deterministically", async () => {
    const testFolder = path.join(__dirname, "static_assets", "mona_lisa");
    const testFileName =
      "1374px-Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg";
    const fileArrBuf = bufferToArrayBuffer(
      await fs.readFileSync(path.join(testFolder, testFileName))
    );
    const password = "somepassword";
    const res1 = await encryptArrayBuffer(fileArrBuf, password);
    const res2 = await encryptArrayBuffer(fileArrBuf, password);

    assert.ok(!Buffer.from(res1).equals(Buffer.from(res2)));
  });

  it("should decrypt binary file and get the same result as openssl", async () => {
    const testFolder = path.join(__dirname, "static_assets", "mona_lisa");
    const testFileName =
      "1374px-Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg";
    const fileArrBuf = bufferToArrayBuffer(
      await fs.readFileSync(path.join(testFolder, testFileName + ".enc"))
    );
    const password = "somepassword";
    const dec = await decryptArrayBuffer(fileArrBuf, password);
    const opensslArrBuf = bufferToArrayBuffer(
      await fs.readFileSync(path.join(testFolder, testFileName))
    );

    assert.deepEqual(Buffer.from(dec), Buffer.from(opensslArrBuf));
  });

  it("should get size from origin to encrypted correctly", () => {
    assert.throws(() => getSizeFromOrigToEnc(-1));
    assert.throws(() => getSizeFromOrigToEnc(0.5));
    assert.equal(getSizeFromOrigToEnc(0), 32);
    assert.equal(getSizeFromOrigToEnc(15), 32);
    assert.equal(getSizeFromOrigToEnc(16), 48);
    assert.equal(getSizeFromOrigToEnc(31), 48);
    assert.equal(getSizeFromOrigToEnc(32), 64);
    assert.equal(getSizeFromOrigToEnc(14787203), 14787232);
  });

  it("should get size from encrypted to origin correctly", () => {
    assert.throws(() => getSizeFromEncToOrig(-1));
    assert.throws(() => getSizeFromEncToOrig(30));

    assert.deepEqual(getSizeFromEncToOrig(32), {
      minSize: 0,
      maxSize: 15,
    });
    assert.deepEqual(getSizeFromEncToOrig(48), {
      minSize: 16,
      maxSize: 31,
    });

    assert.throws(() => getSizeFromEncToOrig(14787231));

    const { minSize, maxSize } = getSizeFromEncToOrig(14787232);
    assert.ok(minSize <= 14787203 && 14787203 <= maxSize);
  });
});
