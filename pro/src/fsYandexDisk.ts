import { nanoid } from "nanoid";
import PQueue from "p-queue";
import type { Entity } from "../../src/baseTypes";
import { FakeFs } from "../../src/fsAll";
import { unixTimeToStr } from "../../src/misc";
import {
  COMMAND_CALLBACK_YANDEXDISK,
  YANDEXDISK_CLIENT_ID,
  YANDEXDISK_CLIENT_SECRET,
  type YandexDiskConfig,
} from "./baseTypesPro";
import {
  type FilesResourceList,
  type Resource,
  type ResourceList,
  YandexApi,
} from "./yandexApi";

export const DEFAULT_YANDEXDISK_CONFIG: YandexDiskConfig = {
  accessToken: "",
  accessTokenExpiresInMs: 0,
  accessTokenExpiresAtTimeMs: 0,
  refreshToken: "",
  scope: "",
  kind: "yandexdisk",
};

/**
 * https://yandex.com/dev/id/doc/en/codes/code-url#code
 */
export const generateAuthUrl = (hasCallback: boolean) => {
  let callback = `https://oauth.yandex.com/verification_code`;
  if (hasCallback) {
    callback = `obsidian://${COMMAND_CALLBACK_YANDEXDISK}`;
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: YANDEXDISK_CLIENT_ID ?? "",
    redirect_uri: callback,
    force_confirm: "yes",
    state: nanoid(),
  });

  const url = `https://oauth.yandex.com/authorize?${params}`;
  return url;
};

interface AuthResSucc {
  token_type: "bearer";
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string | undefined;
}

interface AuthResFail {
  error: string;
  error_description: string;
}

/**
 * https://yandex.com/dev/id/doc/en/codes/code-url#token
 */
export const sendAuthReq = async (authCode: string, errorCallBack: any) => {
  try {
    const k = {
      code: authCode,
      grant_type: "authorization_code",
      client_id: YANDEXDISK_CLIENT_ID ?? "",
      client_secret: YANDEXDISK_CLIENT_SECRET ?? "",
      // redirect_uri: `obsidian://${COMMAND_CALLBACK_BOX}`,
    };
    // console.debug(k);
    const resp1 = await fetch(`https://oauth.yandex.com/token`, {
      method: "POST",
      body: new URLSearchParams(k),
    });

    if (resp1.status !== 200) {
      const resp2: AuthResFail = await resp1.json();
      throw Error(JSON.stringify(resp2));
    }

    const resp2: AuthResSucc = await resp1.json();
    return resp2;
  } catch (e) {
    console.error(e);
    if (errorCallBack !== undefined) {
      await errorCallBack(e);
    }
  }
};

/**
 * https://yandex.com/dev/id/doc/en/tokens/refresh-client
 */
export const sendRefreshTokenReq = async (refreshToken: string) => {
  console.debug(`refreshing token`);
  const x = await fetch("https://oauth.yandex.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: YANDEXDISK_CLIENT_ID ?? "",
      client_secret: YANDEXDISK_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (x.status === 200) {
    const y: AuthResSucc = await x.json();
    console.debug(`new token obtained`);
    return y;
  } else {
    const y: AuthResFail = await x.json();
    throw Error(`cannot refresh an access token: ${JSON.stringify(y)}`);
  }
};

export const setConfigBySuccessfullAuthInplace = async (
  config: YandexDiskConfig,
  authRes: any,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  if (authRes.access_token === undefined || authRes.access_token === "") {
    throw Error(
      `you should not save the setting for ${JSON.stringify(authRes)}`
    );
  }

  config.accessToken = authRes.access_token;
  config.accessTokenExpiresAtTimeMs =
    Date.now() + authRes.expires_in * 1000 - 5 * 60 * 1000;
  config.accessTokenExpiresInMs = authRes.expires_in * 1000;
  config.refreshToken = authRes.refresh_token || config.refreshToken;

  // manually set it expired after 60 days;
  config.credentialsShouldBeDeletedAtTimeMs =
    Date.now() + 1000 * 60 * 60 * 24 * 59;

  await saveUpdatedConfigFunc?.();

  console.info("finish updating local info of Yandex Disk token");
};

const getYandexDiskPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = `disk:/${remoteBaseDir}`;
  } else if (fileOrFolderPath.startsWith("/")) {
    console.warn(
      `why the path ${fileOrFolderPath} starts with '/'? but we just go on.`
    );
    key = `disk:/${remoteBaseDir}${fileOrFolderPath}`;
  } else {
    key = `disk:/${remoteBaseDir}/${fileOrFolderPath}`;
  }
  if (key.endsWith("/")) {
    key = key.slice(0, key.length - 1);
  }
  return key;
};

const getNormPath = (
  fileOrFolderPath: string,
  remoteBaseDir: string,
  type: "dir" | "file"
) => {
  if (
    !(
      fileOrFolderPath === `disk:/${remoteBaseDir}` ||
      fileOrFolderPath.startsWith(`disk:/${remoteBaseDir}/`)
    )
  ) {
    throw Error(
      `"${fileOrFolderPath}" doesn't starts with "disk:/${remoteBaseDir}/"`
    );
  }
  let key = fileOrFolderPath.slice(`disk:/${remoteBaseDir}/`.length);
  if (type === "dir") {
    key = `${key}/`;
  }
  return key;
};

const fromResourceToEntity = (x: Resource, remoteBaseDir: string): Entity => {
  const key = getNormPath(x.path!, remoteBaseDir, x.type!);
  if (x.type === "dir") {
    return {
      key: key,
      keyRaw: key,
      size: 0,
      sizeRaw: 0,
    } as Entity;
  } else {
    // file
    const mtimeCli = Date.parse(
      x?.custom_properties?.rclone_modified ?? x.modified!
    ).valueOf();
    const mtimeSvr = Date.parse(x.modified!).valueOf();
    return {
      key: key,
      keyRaw: key,
      mtimeCli: mtimeCli,
      mtimeSvr: mtimeSvr,
      size: x.size!,
      sizeRaw: x.size!,
      hash: x.sha256,
    } as Entity;
  }
};

const FIELDS_FOR_RESOURCE = [
  "name",
  "created",
  "modified",
  "path",
  "type",
  "size",
  "sha256",
  "md5",
  "_embedded.limit",
  "_embedded.offset",
  "_embedded.total",
  "_embedded.items.created",
  "_embedded.items.modified",
  "_embedded.items.path",
  "_embedded.items.name",
  "_embedded.items.type",
  "_embedded.items.size",
  "_embedded.items.sha256",
  "_embedded.items.md5",
  "_embedded.items.mime_type",
  "_embedded.items.file",
  "_embedded.items.custom_properties",
];

export class FakeFsYandexDisk extends FakeFs {
  kind: string;
  yandexDiskConfig: YandexDiskConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;

  constructor(
    yandexDiskConfig: YandexDiskConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "yandexdisk";
    this.yandexDiskConfig = yandexDiskConfig;
    this.remoteBaseDir = this.yandexDiskConfig.remoteBaseDir || vaultName || "";
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
  }

  async _init() {
    const access = await this._getAccessToken();
    const client = new YandexApi(access);

    if (this.vaultFolderExists) {
      // pass
    } else {
      const res: Resource[] = [];
      let offset = 0;
      const limit = 100;
      let total = 100;
      do {
        const k = await client.diskResources(
          "disk:/",
          FIELDS_FOR_RESOURCE,
          limit,
          offset
        );
        res.push(...(k._embedded?.items ?? []));
        total = k._embedded?.total ?? 0;
        offset += limit;
      } while (offset < total);

      if (res.filter((x) => x.name === this.remoteBaseDir).length > 0) {
        // found
        this.vaultFolderExists = true;
      } else {
        // need to create
        await client.diskResourcesPut(`disk:/${this.remoteBaseDir}`);
        this.vaultFolderExists = true;
      }
    }
  }

  async _getAccessToken() {
    if (this.yandexDiskConfig.refreshToken === "") {
      throw Error("The user has not manually auth yet.");
    }

    const ts = Date.now();
    const comp = this.yandexDiskConfig.accessTokenExpiresAtTimeMs > ts;
    // console.debug(`this.yandexDiskConfig.accessTokenExpiresAtTimeMs=${this.yandexDiskConfig.accessTokenExpiresAtTimeMs},ts=${ts},comp=${comp}`)
    if (comp) {
      return this.yandexDiskConfig.accessToken;
    }

    // refresh
    const k = await sendRefreshTokenReq(this.yandexDiskConfig.refreshToken);
    this.yandexDiskConfig.accessToken = k.access_token;
    this.yandexDiskConfig.accessTokenExpiresInMs = k.expires_in * 1000;
    this.yandexDiskConfig.accessTokenExpiresAtTimeMs =
      ts + k.expires_in * 1000 - 60 * 2 * 1000;
    await this.saveUpdatedConfigFunc();
    console.info("Yandex Disk accessToken updated");
    return this.yandexDiskConfig.accessToken;
  }

  async walk(): Promise<Entity[]> {
    await this._init();

    // bfs
    const queue = new PQueue({
      concurrency: 5, // TODO: make it configurable?
      autoStart: true,
    });
    queue.on("error", (error) => {
      queue.pause();
      queue.clear();
      throw error;
    });

    const entities: Entity[] = [];

    let parents = ["/"];
    while (parents.length !== 0) {
      const children: typeof parents = [];
      for (const p of parents) {
        queue.add(async () => {
          const entitiesOfALevel = await this._walkFolder(p);
          for (const entity of entitiesOfALevel) {
            entities.push(entity);
            if (entity.keyRaw.endsWith("/")) {
              children.push(entity.keyRaw);
            }
          }
        });
      }
      await queue.onIdle();
      parents = children;
    }

    // console.debug(entities);
    return entities;
  }

  async walkPartial(): Promise<Entity[]> {
    await this._init();
    const entities = await this._walkFolder("/");
    return entities;
  }

  async _walkFolder(key: string) {
    if (!key.endsWith("/")) {
      throw Error(`should not call _walkFolder on ${key}`);
    }
    const client = new YandexApi(await this._getAccessToken());
    const p = getYandexDiskPath(key, this.remoteBaseDir);
    const entities: Entity[] = [];
    let offset = 0;
    const limit = 100;
    let total = 100;
    // TODO: once we know the total in the first loop, we can run the list in parallel
    do {
      const k = await client.diskResources(
        p,
        FIELDS_FOR_RESOURCE,
        limit,
        offset
      );
      entities.push(
        ...(k._embedded?.items ?? []).map((x) =>
          fromResourceToEntity(x, this.remoteBaseDir)
        )
      );
      total = k._embedded?.total ?? 0;
      offset += limit;
    } while (offset < total);
    return entities;
  }

  async stat(key: string): Promise<Entity> {
    await this._init();
    const client = new YandexApi(await this._getAccessToken());
    const p = getYandexDiskPath(key, this.remoteBaseDir);
    const r = await client.diskResources(p, FIELDS_FOR_RESOURCE);
    const entity = fromResourceToEntity(r, this.remoteBaseDir);
    return entity;
  }

  async mkdir(
    key: string,
    mtime?: number | undefined,
    ctime?: number | undefined
  ): Promise<Entity> {
    // console.debug(`mkdir ${key} begin`)
    await this._init();
    const client = new YandexApi(await this._getAccessToken());
    const p = getYandexDiskPath(key, this.remoteBaseDir);
    // create
    await client.diskResourcesPut(p, FIELDS_FOR_RESOURCE);
    // patch?
    const custom: Record<string, string> = {};
    if (mtime !== undefined) {
      custom["rclone_modified"] = unixTimeToStr(mtime, true);
    }
    if (ctime !== undefined) {
      custom["rclone_created"] = unixTimeToStr(ctime, true);
    }
    if (Object.keys(custom).length > 0) {
      await client.diskResourcesPatch(p, custom);
    }
    const entity = await this.stat(key);
    // console.debug(`mkdir ${key} finish, ${JSON.stringify(entity)}`)
    return entity;
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    // console.debug(`writeFile ${key} begin`)
    await this._init();
    const client = new YandexApi(await this._getAccessToken());
    const p = getYandexDiskPath(key, this.remoteBaseDir);
    await client.diskResoucesUpload(p, content, true);
    // console.debug(`writeFile ${key} upload succ`)
    // patch?
    const custom: Record<string, string> = {};
    if (mtime !== undefined) {
      custom["rclone_modified"] = unixTimeToStr(mtime, true);
    }
    if (ctime !== undefined) {
      custom["rclone_created"] = unixTimeToStr(ctime, true);
    }
    if (Object.keys(custom).length > 0) {
      await client.diskResourcesPatch(p, custom);
    }
    // console.debug(`writeFile ${key} patch succ`)
    const entity = await this.stat(key);
    // console.debug(`writeFile ${key} finish, ${JSON.stringify(entity)}`)
    return entity;
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    // console.debug(`readFile ${key} begin`)
    await this._init();
    const client = new YandexApi(await this._getAccessToken());
    const p = getYandexDiskPath(key, this.remoteBaseDir);
    const content = await client.diskResoucesDownload(p);
    // console.debug(`readFile ${key} finish, length=${content.byteLength}`)
    return content;
  }

  async rename(key1: string, key2: string): Promise<void> {
    await this._init();
    throw new Error("Method not implemented.");
  }

  async rm(key: string): Promise<void> {
    await this._init();
    const client = new YandexApi(await this._getAccessToken());
    const p = getYandexDiskPath(key, this.remoteBaseDir);
    await client.diskResourcesDelete(p, false);
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    // if we can init, we can connect
    try {
      await this._init();
    } catch (err) {
      console.debug(err);
      callbackFunc?.(err);
      return false;
    }
    return await this.checkConnectCommonOps(callbackFunc);
  }

  async getUserDisplayName(): Promise<string> {
    await this._init();
    throw new Error("Method not implemented.");
  }

  /**
   * https://yandex.com/dev/id/doc/en/tokens/token-invalidate
   */
  async revokeAuth(): Promise<any> {
    await fetch(`https://oauth.yandex.com/revoke_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: YANDEXDISK_CLIENT_ID ?? "",
        client_secret: YANDEXDISK_CLIENT_SECRET ?? "",
        access_token: this.yandexDiskConfig.refreshToken, // TODO: which token?
      }).toString(),
    });
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
