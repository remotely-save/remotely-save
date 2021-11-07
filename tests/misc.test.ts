import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";

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
});
