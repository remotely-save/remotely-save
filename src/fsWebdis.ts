import { isEqual } from "lodash";
import {
  DEFAULT_CONTENT_TYPE,
  type Entity,
  type WebdisConfig,
} from "./baseTypes";
import { FakeFs } from "./fsAll";

export const DEFAULT_WEBDIS_CONFIG: WebdisConfig = {
  address: "",
  username: "",
  password: "",
  remoteBaseDir: "",
};

const getWebdisPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = `${remoteBaseDir}`;
  } else if (fileOrFolderPath.startsWith("/")) {
    console.warn(
      `why the path ${fileOrFolderPath} starts with '/'? but we just go on.`
    );
    key = `${remoteBaseDir}${fileOrFolderPath}`;
  } else {
    key = `${remoteBaseDir}/${fileOrFolderPath}`;
  }
  return `rs:fs:v1:${encodeURIComponent(key)}`; // we should encode them!!!!
};

export const getOrigPath = (fullKey: string, remoteBaseDir: string) => {
  const fullKeyDecoded = decodeURIComponent(fullKey);
  const prefix = `rs:fs:v1:${remoteBaseDir}/`;
  // console.debug(`prefix=${prefix}`);
  const suffix1 = ":meta";
  const suffix2 = ":content";
  if (!fullKeyDecoded.startsWith(prefix)) {
    throw Error(`you should not call getOrigEntity on ${fullKey}`);
  }
  let realKey = fullKeyDecoded.slice(prefix.length);
  // console.debug(`realKey=${realKey}`);
  if (realKey.endsWith(suffix1)) {
    realKey = realKey.slice(0, -suffix1.length);
    // console.debug(`realKey=${realKey}`);
  } else if (realKey.endsWith(suffix2)) {
    realKey = realKey.slice(0, -suffix2.length);
    // console.debug(`realKey=${realKey}`);
  }
  // console.debug(`fullKey=${fullKey}, realKey=${realKey}`);
  return realKey;
};

export class FakeFsWebdis extends FakeFs {
  kind: "webdis";
  webdisConfig: WebdisConfig;
  remoteBaseDir: string;
  saveUpdatedConfigFunc: () => Promise<any>;

  constructor(
    webdisConfig: WebdisConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "webdis";
    this.webdisConfig = webdisConfig;
    this.remoteBaseDir = this.webdisConfig.remoteBaseDir || vaultName || "";
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
  }

  async _fetchCommand(
    method: "GET" | "POST" | "PUT",
    urlPath: string,
    content?: ArrayBuffer
  ) {
    const address = this.webdisConfig.address;
    if (!address.startsWith(`https://`) && !address.startsWith(`http://`)) {
      throw Error(
        `your webdis server address should start with https:// or http://`
      );
    }
    if (address.endsWith("/")) {
      throw Error(`your webdis server should not ends with /`);
    }

    if (content !== undefined && method !== "PUT") {
      throw Error(`you can only "POST" ArrayBuffer, not using other methods`);
    }

    const fullUrl = `${address}/${urlPath}`;
    // console.debug(`fullUrl=${fullUrl}`)

    const username = this.webdisConfig.username ?? "";
    const password = this.webdisConfig.password ?? "";
    if (username !== "" && password !== "") {
      return await fetch(fullUrl, {
        method: method,
        headers: {
          Authorization: "Basic " + btoa(username + ":" + password),
        },
        body: content,
      });
    } else if (username === "" && password === "") {
      return await fetch(fullUrl, {
        method: method,
        body: content,
      });
    } else {
      throw Error(
        `your username and password should both be empty or not empty!`
      );
    }
  }

  async walk(): Promise<Entity[]> {
    let cursor = "0";
    const res: Entity[] = [];
    do {
      const command = `SCAN/${cursor}/MATCH/rs:fs:v1:*:meta/COUNT/1000`;
      const rsp = (await (await this._fetchCommand("GET", command)).json())[
        "SCAN"
      ];
      // console.debug(rsp);
      cursor = rsp[0];
      for (const fullKeyWithMeta of rsp[1]) {
        const realKey = getOrigPath(fullKeyWithMeta, this.remoteBaseDir);
        res.push(await this.stat(realKey));
      }
    } while (cursor !== "0");
    // console.debug(`walk res:`);
    // console.debug(res);
    return res;
  }

  async stat(key: string): Promise<Entity> {
    const fullKey = getWebdisPath(key, this.remoteBaseDir);
    return await this._statFromRaw(fullKey);
  }

  async _statFromRaw(key: string): Promise<Entity> {
    // console.debug(`_statFromRaw on ${key}`);
    const command = `HGETALL/${key}:meta`;
    const rsp = (await (await this._fetchCommand("GET", command)).json())[
      "HGETALL"
    ];
    // console.debug(`rsp: ${JSON.stringify(rsp, null, 2)}`);
    if (isEqual(rsp, {})) {
      // empty!
      throw Error(`key ${key} doesn't exist!`);
    }
    const realKey = getOrigPath(key, this.remoteBaseDir);
    return {
      key: realKey,
      keyRaw: realKey,
      mtimeCli: Number.parseInt(rsp["mtime"]),
      mtimeSvr: Number.parseInt(rsp["mtime"]),
      size: Number.parseInt(rsp["size"]),
      sizeRaw: Number.parseInt(rsp["size"]),
    };
  }

  async mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity> {
    let command = `HSET/${getWebdisPath(key, this.remoteBaseDir)}:meta/size/0`;
    if (mtime !== undefined && mtime !== 0) {
      command = `${command}/mtime/${mtime}`;
    }
    if (ctime !== undefined && ctime !== 0) {
      command = `${command}/ctime/${ctime}`;
    }
    const rsp = (await (await this._fetchCommand("GET", command)).json())[
      "HSET"
    ];
    return await this.stat(key);
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    const fullKey = getWebdisPath(key, this.remoteBaseDir);

    // meta
    let command1 = `HSET/${fullKey}:meta/size/${content.byteLength}`;
    if (mtime !== undefined && mtime !== 0) {
      command1 = `${command1}/mtime/${mtime}`;
    }
    if (ctime !== undefined && ctime !== 0) {
      command1 = `${command1}/ctime/${ctime}`;
    }
    const rsp1 = (await (await this._fetchCommand("GET", command1)).json())[
      "HSET"
    ];

    // content
    const command2 = `SET/${fullKey}:content`;
    const rsp2 = (
      await (await this._fetchCommand("PUT", command2, content)).json()
    )["SET"];

    // fetch meta
    return await this.stat(key);
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    const fullKey = getWebdisPath(key, this.remoteBaseDir);
    const command = `GET/${fullKey}:content?type=${DEFAULT_CONTENT_TYPE}`;
    const rsp = await (await this._fetchCommand("GET", command)).arrayBuffer();
    return rsp;
  }

  async rm(key: string): Promise<void> {
    const fullKey = getWebdisPath(key, this.remoteBaseDir);
    const command = `DEL/${fullKey}:meta/${fullKey}:content`;
    const rsp = (await (await this._fetchCommand("PUT", command)).json())[
      "DEL"
    ];
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    try {
      const k = await (
        await this._fetchCommand("GET", "PING/helloworld")
      ).json();
      return isEqual(k, { PING: "helloworld" });
    } catch (err: any) {
      console.error(err);
      callbackFunc?.(err);
      return false;
    }
  }

  async getUserDisplayName(): Promise<string> {
    return this.webdisConfig.username || "<no usernme>";
  }

  async revokeAuth(): Promise<any> {
    throw new Error("Method not implemented.");
  }
}
