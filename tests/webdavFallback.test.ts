import { strict as assert } from "assert";
import { chooseWebdavAddress } from "../src/webdavFallback";

describe("WebDAV address selection", () => {
  const first = "https://primary.example/dav/";
  const second = "https://backup.example/dav/";
  it("keeps single-address behavior without probing", async () => {
    for (const value of [undefined, "", first]) {
      assert.equal(
        await chooseWebdavAddress(first, value, () => assert.fail()),
        first
      );
    }
  });
  it("prefers the primary when both work", async () => {
    const calls: string[] = [];
    assert.equal(
      await chooseWebdavAddress(first, second, async (url) => {
        calls.push(url);
        return true;
      }),
      first
    );
    assert.deepEqual(calls, [first]);
  });
  it("falls back for failed, missing or unresponsive primary collections", async () => {
    for (const failure of [
      () => Promise.reject(Error()),
      () => Promise.resolve(false),
      () => new Promise<boolean>(() => {}),
    ]) {
      assert.equal(
        await chooseWebdavAddress(
          first,
          second,
          (url) => (url === first ? failure() : Promise.resolve(true)),
          10
        ),
        second
      );
    }
  });
  it("stops if both probes fail or if the configured URL is invalid", async () => {
    await assert.rejects(chooseWebdavAddress(first, second, async () => false));
    await assert.rejects(
      chooseWebdavAddress(first, "file:///tmp", () => assert.fail())
    );
  });
});
