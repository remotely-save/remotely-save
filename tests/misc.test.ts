import * as fs from "fs";
import * as path from "path";
import { expect } from "chai";

import * as misc from '../src/misc'

describe("Misc: hidden file", () => {
  it("should find hidden file correctly", () => {
    let item = '';
    expect(misc.isHiddenPath(item)).to.be.false;

    item = '.'
    expect(misc.isHiddenPath(item)).to.be.false;

    item = '..'
    expect(misc.isHiddenPath(item)).to.be.false;

    item = '/x/y/z/../././../a/b/c'
    expect(misc.isHiddenPath(item)).to.be.false;

    item = '.hidden'
    expect(misc.isHiddenPath(item)).to.be.true;

    item = '_hidden_loose'
    expect(misc.isHiddenPath(item)).to.be.true;
    expect(misc.isHiddenPath(item, false)).to.be.false;

    item = '/sdd/_hidden_loose'
    expect(misc.isHiddenPath(item)).to.be.true;

    item = 'what/../_hidden_loose/what/what/what'
    expect(misc.isHiddenPath(item)).to.be.true;

    item = 'what/../_hidden_loose/what/what/what'
    expect(misc.isHiddenPath(item, false)).to.be.false;

    item = 'what/../_hidden_loose/../.hidden/what/what/what'
    expect(misc.isHiddenPath(item, false)).to.be.true;
  });
});
