import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";

import { RemotelySavePluginSettings } from "../src/baseTypes";
import { messyConfigToNormal, normalConfigToMessy } from "../src/configPersist";

chai.use(chaiAsPromised);
const expect = chai.expect;

const DEFAULT_SETTINGS: RemotelySavePluginSettings = {
  s3: {
    s3AccessKeyID: "acc",
  } as any,
  webdav: {
    address: "addr",
  } as any,
  dropbox: {
    username: "ζ΅θ―δΈ­ζ",
  } as any,
  onedrive: {
    username: "test π emoji",
  } as any,
  password: "password",
  serviceType: "s3",
  currLogLevel: "info",
};

describe("Config Persist tests", () => {
  it("should encrypt go back and forth conrrectly", async () => {
    const k = DEFAULT_SETTINGS;
    const k2 = normalConfigToMessy(k);
    const k3 = messyConfigToNormal(k2);
    expect(k3).to.deep.equal(k);
  });
});
