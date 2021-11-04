const webcrypto = require("crypto").webcrypto;

import { expect } from "chai";
import { encryptStringToBase32 } from "../src/encrypt";

describe("Encryption tests", () => {
  beforeEach(function () {
    const window = {
      crypto: webcrypto,
    };

    global.window = window as any;
  });

  it("should encrypt string", async () => {
    const k = "dkjdhkfhdkjgsdklxxd";
    const password = "hey";
    //console.log(window.crypto.getRandomValues)
    expect(await encryptStringToBase32(k, password)).to.not.equal(k);
  });
});
