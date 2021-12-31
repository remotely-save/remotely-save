import { expect } from "chai";
import { JSDOM } from "jsdom";
import * as misc from "../src/misc";

describe("Misc: hidden file", () => {
  it("should find hidden file correctly", () => {
    let item = "";
    expect(misc.isHiddenPath(item)).to.be.false;

    item = ".";
    expect(misc.isHiddenPath(item)).to.be.false;

    item = "..";
    expect(misc.isHiddenPath(item)).to.be.false;

    item = "/x/y/z/../././../a/b/c";
    expect(misc.isHiddenPath(item)).to.be.false;

    item = ".hidden";
    expect(misc.isHiddenPath(item)).to.be.true;

    item = "_hidden_loose";
    expect(misc.isHiddenPath(item)).to.be.true;
    expect(misc.isHiddenPath(item, false)).to.be.false;

    item = "/sdd/_hidden_loose";
    expect(misc.isHiddenPath(item)).to.be.true;

    item = "what/../_hidden_loose/what/what/what";
    expect(misc.isHiddenPath(item)).to.be.true;

    item = "what/../_hidden_loose/what/what/what";
    expect(misc.isHiddenPath(item, false)).to.be.false;

    item = "what/../_hidden_loose/../.hidden/what/what/what";
    expect(misc.isHiddenPath(item, false)).to.be.true;
  });
});

describe("Misc: get folder levels", () => {
  it("should ignore empty path", () => {
    const item = "";
    expect(misc.getFolderLevels(item)).to.be.empty;
  });

  it("should ignore single file", () => {
    const item = "xxx";
    expect(misc.getFolderLevels(item)).to.be.empty;
  });

  it("should detect path ending with /", () => {
    const item = "xxx/";
    const res = ["xxx"];
    expect(misc.getFolderLevels(item)).to.deep.equal(res);
  });

  it("should correctly split folders and files", () => {
    const item = "xxx/yyy/zzz.md";
    const res = ["xxx", "xxx/yyy"];
    expect(misc.getFolderLevels(item)).to.deep.equal(res);

    const item2 = "xxx/yyy/zzz";
    const res2 = ["xxx", "xxx/yyy"];
    expect(misc.getFolderLevels(item2)).to.deep.equal(res2);

    const item3 = "xxx/yyy/zzz/";
    const res3 = ["xxx", "xxx/yyy", "xxx/yyy/zzz"];
    expect(misc.getFolderLevels(item3)).to.deep.equal(res3);
  });

  it("should treat path starting with / correctly", () => {
    const item = "/xxx/yyy/zzz.md";
    const res = ["/xxx", "/xxx/yyy"];
    expect(misc.getFolderLevels(item)).to.deep.equal(res);

    const item2 = "/xxx/yyy/zzz";
    const res2 = ["/xxx", "/xxx/yyy"];
    expect(misc.getFolderLevels(item2)).to.deep.equal(res2);

    const item3 = "/xxx/yyy/zzz/";
    const res3 = ["/xxx", "/xxx/yyy", "/xxx/yyy/zzz"];
    expect(misc.getFolderLevels(item3)).to.deep.equal(res3);

    const item4 = "/xxx";
    const res4 = [] as string[];
    expect(misc.getFolderLevels(item4)).to.deep.equal(res4);

    const item5 = "/";
    const res5 = [] as string[];
    expect(misc.getFolderLevels(item5)).to.deep.equal(res5);
  });
});

describe("Misc: vaild file name tests", () => {
  it("should treat no ascii correctly", async () => {
    const x = misc.isVaildText("😄🍎 apple 苹果");
    // console.log(x)
    expect(x).to.be.true;
  });

  it("should find not-printable chars correctly", async () => {
    const x = misc.isVaildText("😄🍎 apple 苹果\u0000");
    // console.log(x)
    expect(x).to.be.false;
  });

  it("should allow spaces/slashes/...", async () => {
    const x = misc.isVaildText("😄🍎 apple 苹果/-_=/\\*%^&@#$`");
    expect(x).to.be.true;
  });
});

describe("Misc: get dirname", () => {
  it("should return itself for folder", async () => {
    const x = misc.getPathFolder("ssss/");
    // console.log(x)
    expect(x).to.equal("ssss/");
  });

  it("should return folder for file", async () => {
    const x = misc.getPathFolder("sss/yyy");
    // console.log(x)
    expect(x).to.equal("sss/");
  });

  it("should treat / specially", async () => {
    const x = misc.getPathFolder("/");
    expect(x).to.equal("/");

    const y = misc.getPathFolder("/abc");
    expect(y).to.equal("/");
  });
});

describe("Misc: extract svg", () => {
  beforeEach(function () {
    const fakeBrowser = new JSDOM("");
    global.window = fakeBrowser.window as any;
  });

  it("should extract rect from svg correctly", () => {
    const x = "<svg><rect/><g/></svg>";
    const y = misc.extractSvgSub(x);
    // console.log(x)
    expect(y).to.equal("<rect/><g/>");
  });
});
