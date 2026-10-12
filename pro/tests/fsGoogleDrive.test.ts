import { strict as assert } from "assert";
import * as crypto from "crypto";
import {
  DEFAULT_GOOGLEDRIVE_CONFIG,
  FakeFsGoogleDrive,
} from "../src/fsGoogleDrive";

const folderType = "application/vnd.google-apps.folder";
const bytes = (s: string) => new TextEncoder().encode(s).buffer;
const metadata = (
  id: string,
  name: string,
  parent = "vault",
  folder = false
) => ({
  id,
  name,
  parents: [parent],
  mimeType: folder ? folderType : "text/markdown",
  createdTime: "2020-01-01T00:00:00.000Z",
  modifiedTime: "2025-01-01T00:00:00.000Z",
  size: "3",
  md5Checksum: "old",
  trashed: false,
});
class Drive {
  files = new Map<string, any>();
  calls: { url: URL; method: string; opts: any }[] = [];
  sessions = new Map<string, any>();
  next = 0;
  fail?: (url: URL, options: any) => Response | null;
  pageSize = 1000;
  incomplete = false;
  constructor() {
    this.add(metadata("vault", "Test Vault", "root", true));
  }
  add(file: any, content = Buffer.from("old")) {
    this.files.set(file.id, {
      ...file,
      content,
      revisions: [Buffer.from(content)],
    });
    return file;
  }
  json(file: any) {
    const { content, revisions, ...meta } = file;
    return meta;
  }
  response(obj: any, status = 200, headers = {}) {
    return new Response(obj == null ? null : JSON.stringify(obj), {
      status,
      headers,
    });
  }
  commit(id: string | undefined, meta: any, content: Uint8Array) {
    let f: any;
    const fileID = id ?? `new-${++this.next}`;
    if (id) {
      f = this.files.get(id);
      assert(f);
      assert(!("parents" in meta));
      assert(!("createdTime" in meta));
    } else {
      f = { ...metadata(fileID, meta.name, meta.parents[0]), revisions: [] };
      this.files.set(fileID, f);
    }
    Object.assign(f, meta, {
      id: fileID,
      content: Buffer.from(content),
      size: String(content.length),
      md5Checksum: crypto.createHash("md5").update(content).digest("hex"),
    });
    f.revisions.push(Buffer.from(content));
    return this.response(this.json(f));
  }
  fetch = async (input: string | URL | Request, opts: any = {}) => {
    const u = new URL(String(input));
    const method = opts.method ?? "GET";
    this.calls.push({ url: u, method, opts });
    if (this.fail) {
      const r = this.fail(u, opts);
      if (r) return r;
    }
    if (u.pathname === "/drive/v3/files" && method === "GET") {
      const q = u.searchParams.get("q")!;
      const unescapeQuery = (x: string) => x.replace(/\\([\s\S])/g, "$1");
      const parent = unescapeQuery(
        q.match(/^'((?:\\.|[^'])*)' in parents/)![1]
      );
      const nm = q.match(/name='((?:\\.|[^'])*)'/);
      const name = nm && unescapeQuery(nm[1]);
      const all = [...this.files.values()].filter(
        (f) =>
          !f.trashed && f.parents.includes(parent) && (!nm || f.name === name)
      );
      const start = Number(u.searchParams.get("pageToken") || 0);
      const end = start + this.pageSize;
      return this.response({
        files: all.slice(start, end).map((f) => this.json(f)),
        ...(end < all.length ? { nextPageToken: String(end) } : {}),
        incompleteSearch: this.incomplete,
      });
    }
    if (u.pathname === "/drive/v3/files" && method === "POST") {
      const meta = JSON.parse(opts.body);
      const f = {
        ...metadata(`new-${++this.next}`, meta.name, meta.parents[0], true),
        ...meta,
      };
      this.add(f);
      return this.response(this.json(this.files.get(f.id)));
    }
    if (u.pathname.startsWith("/upload/drive/v3/files")) {
      const id = u.pathname.split("/")[5];
      assert.equal(method, id ? "PATCH" : "POST");
      if (id && !this.files.has(id)) return this.response({}, 404);
      if (u.searchParams.get("uploadType") === "multipart") {
        assert.match(
          opts.headers["Content-Type"],
          /^multipart\/related; boundary=/
        );
        const boundary = opts.headers["Content-Type"].split("boundary=")[1];
        const b = Buffer.from(await opts.body.arrayBuffer());
        const first = b.indexOf("\r\n\r\n") + 4;
        const cut = b.indexOf(`\r\n--${boundary}`, first);
        const meta = JSON.parse(b.subarray(first, cut).toString());
        const start = b.indexOf("\r\n\r\n", cut) + 4;
        const end = b.lastIndexOf(`\r\n--${boundary}--\r\n`);
        return this.commit(id, meta, b.subarray(start, end));
      }
      assert.equal(u.searchParams.get("uploadType"), "resumable");
      const location = `https://www.googleapis.com/session/${++this.next}`;
      this.sessions.set(location, {
        id,
        meta: JSON.parse(opts.body),
        parts: [],
        size: Number(opts.headers["X-Upload-Content-Length"]),
      });
      return this.response(null, 200, { Location: location });
    }
    if (u.pathname.startsWith("/session/")) {
      assert.equal(method, "PUT");
      const session = this.sessions.get(String(input));
      assert(session);
      const [, start, end, size] = opts.headers["Content-Range"]
        .match(/bytes (\d+)-(\d+)\/(\d+)/)
        .map(Number);
      const body = Buffer.from(opts.body);
      assert.equal(
        start,
        session.parts.reduce((n: number, b: Buffer) => n + b.length, 0)
      );
      assert.equal(end - start + 1, body.length);
      assert.equal(size, session.size);
      session.parts.push(body);
      if (end + 1 < size) return this.response(null, 308);
      return this.commit(
        session.id,
        session.meta,
        Buffer.concat(session.parts)
      );
    }
    if (u.pathname.startsWith("/drive/v3/files/")) {
      const f = this.files.get(u.pathname.split("/").pop()!);
      if (!f) return this.response({}, 404);
      if (method === "GET")
        return u.searchParams.get("alt") === "media"
          ? new Response(f.content)
          : this.response(this.json(f));
      if (method === "PATCH") {
        const meta = JSON.parse(opts.body);
        assert.deepEqual(meta, { trashed: true });
        Object.assign(f, meta);
        return this.response(this.json(f));
      }
    }
    throw Error(`Unexpected mock request ${method} ${u.pathname}`);
  };
}

function setup() {
  const d = new Drive();
  globalThis.fetch = d.fetch as typeof fetch;
  const client = new FakeFsGoogleDrive(
    {
      ...DEFAULT_GOOGLEDRIVE_CONFIG,
      accessToken: "test",
      refreshToken: "test",
      accessTokenExpiresAtTimeMs: Date.now() + 3600000,
    },
    "Test Vault",
    async () => {}
  );
  return { d, client };
}

describe("Google Drive updates", () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        moment: (x: number) => ({
          toISOString: () => new Date(x).toISOString(),
          format: () => new Date(x).toISOString(),
        }),
      },
    });
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalWindow)
      Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  });
  it(`new note then repeated edits keep one ID and old revisions`, async () => {
    const { d, client: c } = await setup();
    await c.walk();
    const first = await c.writeFile(
      "note.md",
      bytes("v1"),
      1700000000000,
      1600000000000
    );
    await c.writeFile("note.md", bytes("v2"), 1700000001000, 1500000000000);
    const third = await c.writeFile(
      "note.md",
      bytes("v3"),
      1700000002000,
      1400000000000
    );
    assert.equal(first.id, third.id);
    assert.equal(d.files.size, 2);
    const f = d.files.get(first.id);
    assert.deepEqual(
      f.revisions.map((b: Buffer) => b.toString()),
      ["v1", "v2", "v3"]
    );
    assert.equal(f.createdTime, new Date(1600000000000).toISOString());
    assert.equal(Buffer.from(await c.readFile("note.md")).toString(), "v3");
    assert.deepEqual(
      d.calls
        .filter((x) => x.url.pathname.startsWith("/upload/"))
        .map((x) => x.method),
      ["POST", "PATCH", "PATCH"]
    );
  });
  it(`cold-cache nested update preserves path and binary bytes`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("dir", "目录", "vault", true));
    d.add(metadata("orig", "笔记.md", "dir"));
    await c.walk();
    delete c.keyToGDEntity["目录/笔记.md"];
    const data = Uint8Array.from([0, 13, 10, 255, 128, 1]);
    const f = await c.writeFile("目录/笔记.md", data.buffer, 1700000000000, 1);
    assert.equal(f.id, "orig");
    assert.equal(f.key, "目录/笔记.md");
    assert.equal((await c.stat("目录/笔记.md")).key, "目录/笔记.md");
    assert.deepEqual(
      Buffer.from(await c.readFile("目录/笔记.md")),
      Buffer.from(data)
    );
  });
  it(`large-file PATCH initialization followed by PUT chunks preserves revisions`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("large", "large.bin"));
    await c.walk();
    const payload = new Uint8Array(5 * 1024 * 1024 + 123);
    payload.fill(201);
    await c.writeFile("large.bin", payload.buffer, 1700000000000, 1);
    assert.equal(d.files.size, 2);
    assert.equal(d.files.get("large").revisions.length, 2);
    assert.deepEqual(d.files.get("large").content, Buffer.from(payload));
    assert.deepEqual(
      d.calls
        .filter(
          (x) =>
            x.url.pathname.startsWith("/upload/") ||
            x.url.pathname.startsWith("/session/")
        )
        .map((x) => x.method),
      ["PATCH", "PUT", "PUT"]
    );
  });
  it(`new large file still creates then updates same ID`, async () => {
    const { d, client: c } = await setup();
    const payload = new ArrayBuffer(5 * 1024 * 1024 + 1);
    const a = await c.writeFile(
      "new.bin",
      payload,
      1700000000000,
      1600000000000
    );
    const b = await c.writeFile("new.bin", payload, 1700000001000, 1);
    assert.equal(a.id, b.id);
    assert.equal(d.files.get(a.id).revisions.length, 2);
  });
  it(`paginated duplicate listing aborts whole walk before transfers`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("a", "note.md"));
    d.add(metadata("b", "note.md"));
    d.pageSize = 1;
    await assert.rejects(c.walk(), /duplicate name/);
    assert.equal(Object.keys(c.keyToGDEntity).length, 0);
    assert(d.calls.every((x) => x.method === "GET"));
  });
  it(`duplicate vault folders and file/folder collisions stop safely`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("other", "Test Vault", "root", true));
    await assert.rejects(c.walk(), /duplicate name/);
    const x = await setup();
    x.d.add(metadata("file", "dir"));
    await assert.rejects(x.client.mkdir("dir/", 1, 1), /file\/folder conflict/);
    assert(x.d.calls.every((x) => x.method === "GET"));
  });
  it(`concurrent same-path writes and mkdir reuse one object`, async () => {
    const { d, client: c } = await setup();
    const dirs = await Promise.all([
      c.mkdir("dir/", 1, 1),
      c.mkdir("dir/", 1, 1),
    ]);
    assert.equal(dirs[0].id, dirs[1].id);
    const notes = await Promise.all([
      c.writeFile("dir/a.md", bytes("one"), 1000, 1),
      c.writeFile("dir/a.md", bytes("two"), 2000, 1),
    ]);
    assert.equal(notes[0].id, notes[1].id);
    assert.equal(d.files.size, 3);
  });
  it(`failed PATCH never deletes or falls back to POST; retry keeps history`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("orig", "note.md"));
    await c.walk();
    d.fail = (u, o) =>
      u.pathname.startsWith("/upload/") ? d.response({}, 503) : null;
    await assert.rejects(c.writeFile("note.md", bytes("new"), 1000, 1));
    assert.equal(d.files.get("orig").content.toString(), "old");
    assert(d.calls.every((x) => !["POST", "DELETE"].includes(x.method)));
    d.fail = undefined;
    await c.writeFile("note.md", bytes("new"), 1000, 1);
    assert.equal(d.files.get("orig").revisions.length, 2);
  });
  it(`failed listing/incomplete search cannot cause create`, async () => {
    const { d, client: c } = await setup();
    await c._init();
    d.fail = (u, o) => (o.method === "GET" ? d.response({}, 403) : null);
    await assert.rejects(
      c.writeFile("note.md", bytes("new"), 1000, 1),
      /listing failed/
    );
    assert(d.calls.every((x) => x.method === "GET"));
    d.fail = undefined;
    d.incomplete = true;
    await assert.rejects(
      c.writeFile("note.md", bytes("new"), 1000, 1),
      /incomplete/
    );
  });
  it(`disappeared/replaced/modified cached object aborts instead of creating or overwriting`, async () => {
    for (const change of ["missing", "replaced", "modified"]) {
      const { d, client: c } = await setup();
      d.add(metadata("orig", "note.md"));
      await c.walk();
      if (change === "missing") d.files.delete("orig");
      if (change === "replaced") {
        d.files.delete("orig");
        d.add(metadata("new-id", "note.md"));
      }
      if (change === "modified")
        d.files.get("orig").modifiedTime = "2026-01-01T00:00:00Z";
      await assert.rejects(
        c.writeFile("note.md", bytes("new"), 1000, 1),
        /disappeared|identity changed|changed during sync/
      );
      assert(d.calls.every((x) => x.method === "GET"));
    }
  });
  it(`literal apostrophes/backslashes in Drive query names and zero-byte uploads`, async () => {
    const { d, client: c } = await setup();
    const name = "a'\\b.md";
    d.add(metadata("orig", name));
    await c.walk();
    const f = await c.writeFile(name, new ArrayBuffer(0), 1000, 1);
    assert.equal(f.id, "orig");
    assert.equal(d.files.get("orig").content.length, 0);
  });
  it(`removal remains trash-only and clears stale cache`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("orig", "note.md"));
    await c.walk();
    await c.rm("note.md");
    assert.equal(d.files.get("orig").trashed, true);
    assert.equal(c.keyToGDEntity["note.md"], undefined);
    assert(d.calls.every((x) => x.method !== "DELETE"));
  });
  it(`duplicate introduced after walk stops upload`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("orig", "note.md"));
    await c.walk();
    d.add(metadata("dup", "note.md"));
    await assert.rejects(
      c.writeFile("note.md", bytes("new"), 1000, 1),
      /duplicate name/
    );
    assert(d.calls.every((x) => x.method === "GET"));
  });
  it(`interrupted chunk upload leaves old object and never recreates`, async () => {
    const { d, client: c } = await setup();
    d.add(metadata("orig", "note.bin"));
    await c.walk();
    d.fail = (u, o) => (o.method === "PUT" ? d.response({}, 503) : null);
    await assert.rejects(
      c.writeFile("note.bin", new ArrayBuffer(5 * 1024 * 1024 + 1), 1000, 1)
    );
    assert.equal(d.files.get("orig").content.toString(), "old");
    assert(d.calls.every((x) => !["POST", "DELETE"].includes(x.method)));
  });
});
