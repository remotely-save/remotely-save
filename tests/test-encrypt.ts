import * as fs from "fs";
import { expect } from "chai";
import { base64ToBase32 } from "../src/misc";
import {
  decryptBase32ToString,
  encryptStringToBase32,
} from "../src/encrypt";

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

  it("should encrypt and decrypt string and get the same result returned", async () => {
    const k = "jfkkjkjbce7983ycdeknkkjckooAIUHIDIBIE((*BII)njD/d/dd/d/sjxhux";
    const password = "hfiuibec989###oiu982bj1`";
    const enc = await encryptStringToBase32(k, password);
    // console.log(enc);
    const dec = await decryptBase32ToString(enc, password);
    // console.log(dec);
    expect(dec).equal(k);
  });

  it("should encrypt and get the same result as openssl", async () => {
    const fileContent = (
      await fs.readFileSync(__dirname + "/sometext.txt")
    ).toString("utf-8");
    const password = "somepassword";
    const saltHex = "8302F586FAB491EC";
    const enc = await encryptStringToBase32(
      fileContent,
      password,
      undefined,
      saltHex
    );

    // two command returns same result:
    // cat ./sometext.txt | openssl enc -p -aes-256-cbc -S 8302F586FAB491EC -pbkdf2 -iter 10000 -base64 -pass pass:somepassword
    // openssl enc -p -aes-256-cbc -S 8302F586FAB491EC -pbkdf2 -iter 10000 -base64 -pass pass:somepassword -in ./sometext.txt
    const opensslBase64Res =
      "U2FsdGVkX1+DAvWG+rSR7MSa+yJav1zCE7SSXiBooqwI5Q+LMpIthpk/pXkLj+25";
    // we output base32, so we need some transformation
    const opensslBase32Res = base64ToBase32(opensslBase64Res);

    expect(enc).equal(opensslBase32Res);
  });
});
