import { deepStrictEqual, rejects, throws } from "assert";
import { getFileRename } from "../src/conflictLogic";

describe("New name is generated", () => {
  it("should throw for empty file", async () => {
    for (const key of ["", "/", ".", ".."]) {
      throws(() => getFileRename(key));
    }
  });

  it("should throw for folder", async () => {
    for (const key of ["sss/", "ssss/yyy/"]) {
      throws(() => getFileRename(key));
    }
  });

  it("should correctly get no ext files renamed", async () => {
    deepStrictEqual(getFileRename("abc"), "abc.dup");

    deepStrictEqual(getFileRename("xxxx/yyyy/abc"), "xxxx/yyyy/abc.dup");
  });

  it("should correctly get dot files renamed", async () => {
    deepStrictEqual(getFileRename(".abc"), ".abc.dup");

    deepStrictEqual(getFileRename("xxxx/yyyy/.efg"), "xxxx/yyyy/.efg.dup");

    deepStrictEqual(getFileRename("xxxx/yyyy/hij."), "xxxx/yyyy/hij.dup");
  });

  it("should correctly get normal files renamed", async () => {
    deepStrictEqual(getFileRename("abc.efg"), "abc.dup.efg");

    deepStrictEqual(
      getFileRename("xxxx/yyyy/abc.efg"),
      "xxxx/yyyy/abc.dup.efg"
    );

    deepStrictEqual(
      getFileRename("xxxx/yyyy/abc.tar.gz"),
      "xxxx/yyyy/abc.tar.dup.gz"
    );

    deepStrictEqual(
      getFileRename("xxxx/yyyy/.abc.efg"),
      "xxxx/yyyy/.abc.dup.efg"
    );
  });

  it("should correctly get duplicated files renamed again", async () => {
    deepStrictEqual(getFileRename("abc.dup"), "abc.dup.dup");

    deepStrictEqual(
      getFileRename("xxxx/yyyy/.abc.dup"),
      "xxxx/yyyy/.abc.dup.dup"
    );

    deepStrictEqual(
      getFileRename("xxxx/yyyy/abc.dup.md"),
      "xxxx/yyyy/abc.dup.dup.md"
    );

    deepStrictEqual(
      getFileRename("xxxx/yyyy/.abc.dup.md"),
      "xxxx/yyyy/.abc.dup.dup.md"
    );
  });
});
