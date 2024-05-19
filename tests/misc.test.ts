import { strict as assert } from "assert";
import { JSDOM } from "jsdom";
import * as misc from "../src/misc";

describe("Misc: hidden file", () => {
  it("should find hidden file correctly", () => {
    let item = "";
    assert.ok(!misc.isHiddenPath(item));

    item = ".";
    assert.ok(!misc.isHiddenPath(item));

    item = "..";
    assert.ok(!misc.isHiddenPath(item));

    item = "/x/y/z/../././../a/b/c";
    assert.ok(!misc.isHiddenPath(item));

    item = ".hidden";
    assert.ok(misc.isHiddenPath(item));

    item = "_hidden_loose";
    assert.ok(misc.isHiddenPath(item));
    assert.ok(!misc.isHiddenPath(item, true, false));

    item = "/sdd/_hidden_loose";
    assert.ok(misc.isHiddenPath(item));

    item = "what/../_hidden_loose/what/what/what";
    assert.ok(misc.isHiddenPath(item));

    item = "what/../_hidden_loose/what/what/what";
    assert.ok(!misc.isHiddenPath(item, true, false));

    item = "what/../_hidden_loose/../.hidden/what/what/what";
    assert.ok(misc.isHiddenPath(item, true, false));

    item = "what/../_hidden_loose/../.hidden/what/what/what";
    assert.ok(!misc.isHiddenPath(item, false, true));

    item = "what/_hidden_loose/what/what/what";
    assert.ok(misc.isHiddenPath(item, false, true));
    assert.ok(!misc.isHiddenPath(item, true, false));

    item = "what/.hidden/what/what/what";
    assert.ok(!misc.isHiddenPath(item, false, true));
    assert.ok(misc.isHiddenPath(item, true, false));
  });
});

describe("Misc: get folder levels", () => {
  it("should ignore empty path", () => {
    const item = "";
    assert.equal(misc.getFolderLevels(item).length, 0);
  });

  it("should ignore single file", () => {
    const item = "xxx";
    assert.equal(misc.getFolderLevels(item).length, 0);
  });

  it("should detect path ending with /", () => {
    const item = "xxx/";
    const res = ["xxx"];
    assert.deepEqual(misc.getFolderLevels(item), res);
  });

  it("should correctly split folders and files", () => {
    const item = "xxx/yyy/zzz.md";
    const res = ["xxx", "xxx/yyy"];
    assert.deepEqual(misc.getFolderLevels(item), res);

    const item2 = "xxx/yyy/zzz";
    const res2 = ["xxx", "xxx/yyy"];
    assert.deepEqual(misc.getFolderLevels(item2), res2);

    const item3 = "xxx/yyy/zzz/";
    const res3 = ["xxx", "xxx/yyy", "xxx/yyy/zzz"];
    assert.deepEqual(misc.getFolderLevels(item3), res3);
  });

  it("should correctly add ending slash if required", () => {
    const item = "xxx/yyy/zzz.md";
    const res = ["xxx/", "xxx/yyy/"];
    assert.deepEqual(misc.getFolderLevels(item, true), res);

    const item2 = "xxx/yyy/zzz";
    const res2 = ["xxx/", "xxx/yyy/"];
    assert.deepEqual(misc.getFolderLevels(item2, true), res2);

    const item3 = "xxx/yyy/zzz/";
    const res3 = ["xxx/", "xxx/yyy/", "xxx/yyy/zzz/"];
    assert.deepEqual(misc.getFolderLevels(item3, true), res3);
  });

  it("should treat path starting with / correctly", () => {
    const item = "/xxx/yyy/zzz.md";
    const res = ["/xxx", "/xxx/yyy"];
    assert.deepEqual(misc.getFolderLevels(item), res);

    const item2 = "/xxx/yyy/zzz";
    const res2 = ["/xxx", "/xxx/yyy"];
    assert.deepEqual(misc.getFolderLevels(item2), res2);

    const item3 = "/xxx/yyy/zzz/";
    const res3 = ["/xxx", "/xxx/yyy", "/xxx/yyy/zzz"];
    assert.deepEqual(misc.getFolderLevels(item3), res3);

    const item4 = "/xxx";
    const res4 = [] as string[];
    assert.deepEqual(misc.getFolderLevels(item4), res4);

    const item5 = "/";
    const res5 = [] as string[];
    assert.deepEqual(misc.getFolderLevels(item5), res5);
  });
});

describe("Misc: get parent folder", () => {
  it("should treat empty path correctly", () => {
    const item = "";
    assert.equal(misc.getParentFolder(item), "/");
  });

  it("should treat one level path correctly", () => {
    let item = "abc/";
    assert.equal(misc.getParentFolder(item), "/");
    item = "/efg/";
    assert.equal(misc.getParentFolder(item), "/");
  });

  it("should treat more levels path correctly", () => {
    let item = "abc/efg";
    assert.equal(misc.getParentFolder(item), "abc/");
    item = "/hij/klm/";
    assert.equal(misc.getParentFolder(item), "/hij/");
  });
});

describe("Misc: vaild file name tests", () => {
  it("should treat no ascii correctly", async () => {
    const x = misc.isVaildText("😄🍎 apple 苹果");
    // console.log(x)
    assert.ok(x);
  });

  it("should find not-printable chars correctly", async () => {
    const x = misc.isVaildText("😄🍎 apple 苹果\u0000");
    // console.log(x)
    assert.ok(!x);
  });

  it("should allow spaces/slashes/...", async () => {
    const x = misc.isVaildText("😄🍎 apple 苹果/-_=/\\*%^&@#$`");
    assert.ok(x);
  });
});

describe("Misc: get dirname", () => {
  it("should return itself for folder", async () => {
    const x = misc.getPathFolder("ssss/");
    // console.log(x)
    assert.equal(x, "ssss/");
  });

  it("should return folder for file", async () => {
    const x = misc.getPathFolder("sss/yyy");
    // console.log(x)
    assert.equal(x, "sss/");
  });

  it("should treat / specially", async () => {
    const x = misc.getPathFolder("/");
    assert.equal(x, "/");

    const y = misc.getPathFolder("/abc");
    assert.equal(y, "/");
  });
});

describe("Misc: extract svg", () => {
  beforeEach(() => {
    const fakeBrowser = new JSDOM("");
    global.window = fakeBrowser.window as any;
  });

  it("should extract rect from svg correctly", () => {
    const x = "<svg><rect/><g/></svg>";
    const y = misc.extractSvgSub(x);
    // console.log(x)
    assert.equal(y, "<rect/><g/>");
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
    assert.deepEqual(k, k2);
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
    assert.deepEqual(k, k2);
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
    assert.deepEqual(k, k2);
  });
});

describe("Misc: at which level", () => {
  it("should throw error on some parameters", () => {
    assert.throws(() => misc.atWhichLevel(undefined));
    assert.throws(() => misc.atWhichLevel(""));
    assert.throws(() => misc.atWhichLevel(".."));
    assert.throws(() => misc.atWhichLevel("."));
    assert.throws(() => misc.atWhichLevel("/"));
    assert.throws(() => misc.atWhichLevel("/xxyy"));
  });

  it("should treat folders correctly", () => {
    assert.equal(misc.atWhichLevel("x/"), 1);
    assert.equal(misc.atWhichLevel("x/y/"), 2);
  });

  it("should treat files correctly", () => {
    assert.equal(misc.atWhichLevel("x.md"), 1);
    assert.equal(misc.atWhichLevel("x/y.md"), 2);
    assert.equal(misc.atWhichLevel("x/y/z.md"), 3);
  });
});

describe("Misc: special char for dir", () => {
  it("should return false for normal string", () => {
    assert.ok(!misc.checkHasSpecialCharForDir(""));
    assert.ok(!misc.checkHasSpecialCharForDir("xxx"));
    assert.ok(!misc.checkHasSpecialCharForDir("yyy_xxx"));
    assert.ok(!misc.checkHasSpecialCharForDir("yyy.xxx"));
    assert.ok(!misc.checkHasSpecialCharForDir("yyy？xxx"));
  });

  it("should return true for special cases", () => {
    assert.ok(misc.checkHasSpecialCharForDir("?"));
    assert.ok(misc.checkHasSpecialCharForDir("/"));
    assert.ok(misc.checkHasSpecialCharForDir("\\"));
    assert.ok(misc.checkHasSpecialCharForDir("xxx/yyy"));
    assert.ok(misc.checkHasSpecialCharForDir("xxx\\yyy"));
    assert.ok(misc.checkHasSpecialCharForDir("xxx?yyy"));
  });
});

describe("Misc: split chunk ranges", () => {
  it("should fail on negative numner", () => {
    assert.throws(() => misc.splitFileSizeToChunkRanges(-1, 2));
    assert.throws(() => misc.splitFileSizeToChunkRanges(1, -1));
    assert.throws(() => misc.splitFileSizeToChunkRanges(1, 0));
  });

  it("should return nothing for 0 input", () => {
    let input: [number, number] = [0, 1];
    let output: any = [];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));

    input = [0, 100];
    output = [];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));
  });

  it("should return single item for 1 input", () => {
    let input: [number, number] = [1, 1];
    let output = [{ start: 0, end: 0 }];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));

    input = [1, 100];
    output = [{ start: 0, end: 0 }];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));
  });

  it("should return single item for larger or equal input", () => {
    let input: [number, number] = [10, 10];
    let output = [{ start: 0, end: 9 }];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));

    input = [10, 21];
    output = [{ start: 0, end: 9 }];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));
  });

  it("should return correct items for normal input", () => {
    let input: [number, number] = [10, 9];
    let output = [
      { start: 0, end: 8 },
      { start: 9, end: 9 },
    ];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));

    input = [10, 5];
    output = [
      { start: 0, end: 4 },
      { start: 5, end: 9 },
    ];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));

    input = [3, 1];
    output = [
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));

    input = [15, 5];
    output = [
      { start: 0, end: 4 },
      { start: 5, end: 9 },
      { start: 10, end: 14 },
    ];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));

    input = [1024, 578];
    output = [
      { start: 0, end: 577 },
      { start: 578, end: 1023 },
    ];
    assert.deepStrictEqual(output, misc.splitFileSizeToChunkRanges(...input));
  });
});

describe("Misc: Dropbox: should fix the folder name cases", () => {
  it("should do nothing on empty folders", () => {
    const input: any[] = [];
    assert.equal(misc.fixEntityListCasesInplace(input).length, 0);
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
    assert.deepEqual(misc.fixEntityListCasesInplace(input), output);
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
    assert.deepEqual(misc.fixEntityListCasesInplace(input), output);
  });
});
