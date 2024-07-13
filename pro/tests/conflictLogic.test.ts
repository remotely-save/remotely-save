import { deepStrictEqual, rejects, throws } from "assert";
import { getFileRenameForDup } from "../src/conflictLogic";

describe("New name is generated", () => {
  it("should throw for empty file", async () => {
    for (const key of ["", "/", ".", ".."]) {
      throws(() => getFileRenameForDup(key));
    }
  });

  it("should throw for folder", async () => {
    for (const key of ["sss/", "ssss/yyy/"]) {
      throws(() => getFileRenameForDup(key));
    }
  });

  it("should correctly get no ext files renamed", async () => {
    deepStrictEqual(getFileRenameForDup("abc"), "abc.dup");

    deepStrictEqual(getFileRenameForDup("xxxx/yyyy/abc"), "xxxx/yyyy/abc.dup");
  });

  it("should correctly get dot files renamed", async () => {
    deepStrictEqual(getFileRenameForDup(".abc"), ".abc.dup");

    deepStrictEqual(
      getFileRenameForDup("xxxx/yyyy/.efg"),
      "xxxx/yyyy/.efg.dup"
    );

    deepStrictEqual(getFileRenameForDup("xxxx/yyyy/hij."), "xxxx/yyyy/hij.dup");
  });

  it("should correctly get normal files renamed", async () => {
    deepStrictEqual(getFileRenameForDup("abc.efg"), "abc.dup.efg");

    deepStrictEqual(
      getFileRenameForDup("xxxx/yyyy/abc.efg"),
      "xxxx/yyyy/abc.dup.efg"
    );

    deepStrictEqual(
      getFileRenameForDup("xxxx/yyyy/abc.tar.gz"),
      "xxxx/yyyy/abc.tar.dup.gz"
    );

    deepStrictEqual(
      getFileRenameForDup("xxxx/yyyy/.abc.efg"),
      "xxxx/yyyy/.abc.dup.efg"
    );
  });

  it("should correctly get duplicated files renamed again", async () => {
    deepStrictEqual(getFileRenameForDup("abc.dup"), "abc.dup.dup");

    deepStrictEqual(
      getFileRenameForDup("xxxx/yyyy/.abc.dup"),
      "xxxx/yyyy/.abc.dup.dup"
    );

    deepStrictEqual(
      getFileRenameForDup("xxxx/yyyy/abc.dup.md"),
      "xxxx/yyyy/abc.dup.dup.md"
    );

    deepStrictEqual(
      getFileRenameForDup("xxxx/yyyy/.abc.dup.md"),
      "xxxx/yyyy/.abc.dup.dup.md"
    );
  });
});
