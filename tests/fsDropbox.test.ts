import { strict as assert } from "assert";
import type { Dropbox } from "dropbox";
import { doActualSync } from "../pro/src/sync";
import type { Entity, MixedEntity } from "../src/baseTypes";
import type { FakeFs } from "../src/fsAll";
import { DEFAULT_DROPBOX_CONFIG, FakeFsDropbox } from "../src/fsDropbox";
import type { FakeFsEncrypt } from "../src/fsEncrypt";
import type { InternalDBs } from "../src/localdb";

function mockDropbox(remove: (path: string) => Promise<void>) {
  const fs = new FakeFsDropbox(
    { ...DEFAULT_DROPBOX_CONFIG },
    "vault",
    async () => {}
  );
  fs._init = async () => fs;
  fs.dropbox = {
    filesDeleteV2: async ({ path }: { path: string }) => {
      await remove(path);
      return { status: 200, result: {} };
    },
  } as unknown as Dropbox;
  return fs;
}

describe("Dropbox: deletion", () => {
  it("deletes the requested file and normalizes folder paths", async () => {
    const paths: string[] = [];
    const fs = mockDropbox(async (path) => {
      paths.push(path);
    });
    await fs.rm("note.md");
    await fs.rm("folder/");
    assert.deepEqual(paths, ["/vault/note.md", "/vault/folder"]);
  });

  it("does not delete the vault root", async () => {
    const fs = mockDropbox(async () => {
      assert.fail("must not delete root");
    });
    await fs.rm("/");
  });

  for (const error of [
    new Error("network failure"),
    Object.assign(new Error("unauthorized"), { status: 401 }),
    Object.assign(new Error("write conflict"), {
      status: 409,
      error: {
        error: {
          ".tag": "path_write",
          path_write: { ".tag": "no_write_permission" },
        },
      },
    }),
  ]) {
    it(`propagates ${error.message}`, async () => {
      const fs = mockDropbox(async () => {
        throw error;
      });
      await assert.rejects(fs.rm("note.md"), (err) => err === error);
    });
  }

  it("accepts a file already deleted on another device", async () => {
    const fs = mockDropbox(async () => {
      throw Object.assign(new Error("not found"), {
        status: 409,
        error: {
          error: {
            ".tag": "path_lookup",
            path_lookup: { ".tag": "not_found" },
          },
        },
      });
    });
    await fs.rm("note.md");
  });

  it("does not confuse other lookup errors with an already deleted file", async () => {
    const error = Object.assign(new Error("restricted content"), {
      status: 409,
      error: {
        error: {
          ".tag": "path_lookup",
          path_lookup: { ".tag": "restricted_content" },
        },
      },
    });
    const fs = mockDropbox(async () => {
      throw error;
    });
    await assert.rejects(fs.rm("note.md"), (err) => err === error);
  });

  for (const key of ["note.md", "folder/"]) {
    it(`retains sync history after a failed deletion of ${key} and clears it after retry`, async () => {
      let fail = true;
      let attempts = 0;
      const dropbox = mockDropbox(async () => {
        attempts++;
        if (fail) throw new Error("delete refused");
      });
      const encrypted = {
        rm: (path: string) => dropbox.rm(path),
      } as FakeFsEncrypt;
      const record: Entity = { key, keyRaw: key, size: 1, sizeRaw: 1 };
      const recordKey = `vault-id\tprofile-id\t${key}`;
      const history = new Map([[recordKey, record]]);
      const db = {
        prevSyncRecordsTbl: {
          removeItem: async (id: string) => {
            history.delete(id);
          },
        },
      } as unknown as InternalDBs;
      const plan: Record<string, MixedEntity> = {
        [key]: {
          key,
          remote: record,
          prevSync: record,
          decision: key.endsWith("/")
            ? "folder_to_be_deleted_on_remote"
            : "local_is_deleted_thus_also_delete_remote",
          change: true,
        },
      };
      const run = () =>
        doActualSync(
          plan,
          {} as FakeFs,
          encrypted,
          "vault-id",
          "profile-id",
          1,
          -1,
          () => "unexpected protection error",
          db,
          undefined,
          "keep_newer",
          "manual"
        );
      await assert.rejects(run(), /delete refused/);
      assert.equal(history.get(recordKey), record);
      fail = false;
      await run();
      assert.equal(attempts, 2);
      assert.equal(history.has(recordKey), false);
    });
  }
});
