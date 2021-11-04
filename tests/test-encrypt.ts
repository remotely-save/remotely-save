import { expect } from "chai";
import { encryptStringToBase32 } from "../src/encrypt";

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
});
