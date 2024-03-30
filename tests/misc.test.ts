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
    expect(misc.isHiddenPath(item, true, false)).to.be.false;

    item = "/sdd/_hidden_loose";
    expect(misc.isHiddenPath(item)).to.be.true;

    item = "what/../_hidden_loose/what/what/what";
    expect(misc.isHiddenPath(item)).to.be.true;

    item = "what/../_hidden_loose/what/what/what";
    expect(misc.isHiddenPath(item, true, false)).to.be.false;

    item = "what/../_hidden_loose/../.hidden/what/what/what";
    expect(misc.isHiddenPath(item, true, false)).to.be.true;

    item = "what/../_hidden_loose/../.hidden/what/what/what";
    expect(misc.isHiddenPath(item, false, true)).to.be.false;

    item = "what/_hidden_loose/what/what/what";
    expect(misc.isHiddenPath(item, false, true)).to.be.true;
    expect(misc.isHiddenPath(item, true, false)).to.be.false;

    item = "what/.hidden/what/what/what";
    expect(misc.isHiddenPath(item, false, true)).to.be.false;
    expect(misc.isHiddenPath(item, true, false)).to.be.true;
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

  it("should correctly add ending slash if required", () => {
    const item = "xxx/yyy/zzz.md";
    const res = ["xxx/", "xxx/yyy/"];
    expect(misc.getFolderLevels(item, true)).to.deep.equal(res);

    const item2 = "xxx/yyy/zzz";
    const res2 = ["xxx/", "xxx/yyy/"];
    expect(misc.getFolderLevels(item2, true)).to.deep.equal(res2);

    const item3 = "xxx/yyy/zzz/";
    const res3 = ["xxx/", "xxx/yyy/", "xxx/yyy/zzz/"];
    expect(misc.getFolderLevels(item3, true)).to.deep.equal(res3);
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

describe("Misc: get parent folder", () => {
  it("should treat empty path correctly", () => {
    const item = "";
    expect(misc.getParentFolder(item)).equals("/");
  });

  it("should treat one level path correctly", () => {
    let item = "abc/";
    expect(misc.getParentFolder(item)).equals("/");
    item = "/efg/";
    expect(misc.getParentFolder(item)).equals("/");
  });

  it("should treat more levels path correctly", () => {
    let item = "abc/efg";
    expect(misc.getParentFolder(item)).equals("abc/");
    item = "/hij/klm/";
    expect(misc.getParentFolder(item)).equals("/hij/");
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

describe("Misc: get split ranges", () => {
  it("should deal with big parts", () => {
    const k = misc.getSplitRanges(10, 20);
    const k2: misc.SplitRange[] = [
      {
        partNum: 1,
        start: 0,
        end: 10,
      },
    ];
    expect(k).to.deep.equal(k2);
  });

  it("should deal with 0 remainder", () => {
    const k = misc.getSplitRanges(20, 10);
    const k2: misc.SplitRange[] = [
      {
        partNum: 1,
        start: 0,
        end: 10,
      },
      {
        partNum: 2,
        start: 10,
        end: 20,
      },
    ];
    expect(k).to.deep.equal(k2);
  });

  it("should deal with not-0 remainder", () => {
    const k = misc.getSplitRanges(25, 10);
    const k2: misc.SplitRange[] = [
      {
        partNum: 1,
        start: 0,
        end: 10,
      },
      {
        partNum: 2,
        start: 10,
        end: 20,
      },
      {
        partNum: 3,
        start: 20,
        end: 25,
      },
    ];
    expect(k).to.deep.equal(k2);
  });
});

describe("Misc: at which level", () => {
  it("should throw error on some parameters", () => {
    expect(() => misc.atWhichLevel(undefined)).to.throw();
    expect(() => misc.atWhichLevel("")).to.throw();
    expect(() => misc.atWhichLevel("..")).to.throw();
    expect(() => misc.atWhichLevel(".")).to.throw();
    expect(() => misc.atWhichLevel("/")).to.throw();
    expect(() => misc.atWhichLevel("/xxyy")).to.throw();
  });

  it("should treat folders correctly", () => {
    expect(misc.atWhichLevel("x/")).to.be.equal(1);
    expect(misc.atWhichLevel("x/y/")).to.be.equal(2);
  });

  it("should treat files correctly", () => {
    expect(misc.atWhichLevel("x.md")).to.be.equal(1);
    expect(misc.atWhichLevel("x/y.md")).to.be.equal(2);
    expect(misc.atWhichLevel("x/y/z.md")).to.be.equal(3);
  });
});

describe("Misc: special char for dir", () => {
  it("should return false for normal string", () => {
    expect(misc.checkHasSpecialCharForDir("")).to.be.false;
    expect(misc.checkHasSpecialCharForDir("xxx")).to.be.false;
    expect(misc.checkHasSpecialCharForDir("yyy_xxx")).to.be.false;
    expect(misc.checkHasSpecialCharForDir("yyy.xxx")).to.be.false;
    expect(misc.checkHasSpecialCharForDir("yyy？xxx")).to.be.false;
  });

  it("should return true for special cases", () => {
    expect(misc.checkHasSpecialCharForDir("?")).to.be.true;
    expect(misc.checkHasSpecialCharForDir("/")).to.be.true;
    expect(misc.checkHasSpecialCharForDir("\\")).to.be.true;
    expect(misc.checkHasSpecialCharForDir("xxx/yyy")).to.be.true;
    expect(misc.checkHasSpecialCharForDir("xxx\\yyy")).to.be.true;
    expect(misc.checkHasSpecialCharForDir("xxx?yyy")).to.be.true;
  });
});

describe("Misc: Dropbox: should fix the folder name cases", () => {
  it("should do nothing on empty folders", () => {
    const input: any[] = [];
    expect(misc.fixEntityListCasesInplace(input)).to.be.empty;
  });

  it("should sort folders by length by side effect", () => {
    const input = [
      { keyRaw: "aaaa/" },
      { keyRaw: "bbb/" },
      { keyRaw: "c/" },
      { keyRaw: "dd/" },
    ];

    const output = [
      { keyRaw: "c/" },
      { keyRaw: "dd/" },
      { keyRaw: "bbb/" },
      { keyRaw: "aaaa/" },
    ];
    expect(misc.fixEntityListCasesInplace(input)).to.deep.equal(output);
  });

  it("should fix folder names", () => {
    const input = [
      { keyRaw: "AAA/" },
      { keyRaw: "aaa/bbb/CCC.md" },
      { keyRaw: "aaa/BBB/" },

      { keyRaw: "ddd/" },
      { keyRaw: "DDD/EEE/fff.md" },
      { keyRaw: "DDD/eee/" },

      { keyRaw: "Ggg/" },
      { keyRaw: "ggG/hHH你好/Fff世界.md" },
      { keyRaw: "ggG/Hhh你好/" },
    ];

    const output = [
      { keyRaw: "AAA/" },
      { keyRaw: "ddd/" },
      { keyRaw: "Ggg/" },
      { keyRaw: "AAA/BBB/" },
      { keyRaw: "ddd/eee/" },
      { keyRaw: "Ggg/Hhh你好/" },
      { keyRaw: "AAA/BBB/CCC.md" },
      { keyRaw: "ddd/eee/fff.md" },
      { keyRaw: "Ggg/Hhh你好/Fff世界.md" },
    ];
    expect(misc.fixEntityListCasesInplace(input)).to.deep.equal(output);
  });
});
