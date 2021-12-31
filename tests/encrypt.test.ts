import * as fs from "fs";
import * as path from "path";
import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { base64ToBase64url, bufferToArrayBuffer } from "../src/misc";
import {
  decryptArrayBuffer,
  decryptBase32ToString,
  encryptArrayBuffer,
  encryptStringToBase32,
  encryptStringToBase64url,
} from "../src/encrypt";

chai.use(chaiAsPromised);
const expect = chai.expect;

describe("Encryption tests", () => {
  beforeEach(function () {
    global.window = {
      crypto: require("crypto").webcrypto,
    } as any;
  });

  it("should encrypt string", async () => {
    const k = "dkjdhkfhdkjgsdklxxd";
    const password = "hey";
    expect(await encryptStringToBase32(k, password)).to.not.equal(k);
  });

  it("should raise error using different password", async () => {
    const k = "secret text";
    const password = "hey";
    const password2 = "hey2";
    const enc = await encryptStringToBase32(k, password);
    await expect(decryptBase32ToString(enc, password2)).to.be.rejected;
  });

  it("should encrypt and decrypt string and get the same result returned", async () => {
    const k = "jfkkjkjbce7983ycdeknkkjckooAIUHIDIBIE((*BII)njD/d/dd/d/sjxhux";
    const password = "hfiuibec989###oiu982bj1`";
    const enc = await encryptStringToBase32(k, password);
    // console.log(enc);
    const dec = await decryptBase32ToString(enc, password);
    // console.log(dec);
    expect(dec).equal(k);
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

    expect(enc).equal(opensslBase64urlRes);
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

    expect(Buffer.from(enc).equals(Buffer.from(opensslArrBuf))).to.be.true;
  });

  it("should descypt binary file and get the same result as openssl", async () => {
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

    expect(Buffer.from(dec).equals(Buffer.from(opensslArrBuf))).to.be.true;
  });
});
