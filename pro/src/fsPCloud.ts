import { nanoid } from "nanoid";
import { requestUrl } from "obsidian";
import pcloudSdk from "pcloud-sdk-js";
import {
  type Entity,
  OAUTH2_FORCE_EXPIRE_MILLISECONDS,
} from "../../src/baseTypes";
import { FakeFs } from "../../src/fsAll";
import { getFolderLevels } from "../../src/misc";
import {
  COMMAND_CALLBACK_PCLOUD,
  PCLOUD_CLIENT_ID,
  PCLOUD_CLIENT_SECRET,
  type PCloudConfig,
} from "./baseTypesPro";

export const DEFAULT_PCLOUD_CONFIG: PCloudConfig = {
  accessToken: "",
  hostname: "eapi.pcloud.com",
  locationid: 2,
  credentialsShouldBeDeletedAtTimeMs: 0,
  emptyFile: "skip",
  kind: "pcloud",
};

export interface AuthAllowFirstRes {
  code: string;
  state?: string;
  locationid: 1 | 2;
  hostname: "api.pcloud.com" | "eapi.pcloud.com";
}

/**
 * https://docs.pcloud.com/methods/oauth_2.0/authorize.html
 */
export const generateAuthUrl = async (hasCallback: boolean) => {
  const clientID = PCLOUD_CLIENT_ID;
  const state = nanoid();
  let authUrl = `https://my.pcloud.com/oauth2/authorize?response_type=code&client_id=${clientID}&state=${state}`;
  if (hasCallback) {
    authUrl += `&redirect_uri=obsidian://${COMMAND_CALLBACK_PCLOUD}`;
  }
  return {
    authUrl,
    state,
  };
};

interface AuthResSucc {
  result: number;
  access_token: string;
  token_type: "bearer";
  uid: number;
  locationid: number;
}

/**
 * https://docs.pcloud.com/methods/oauth_2.0/oauth2_token.html
 */
export const sendAuthReq = async (
  hostname: string,
  authCode: string,
  errorCallBack: any
) => {
  const clientID = PCLOUD_CLIENT_ID ?? "";
  const clientSecret = PCLOUD_CLIENT_SECRET ?? "";
  try {
    const k = {
      code: authCode,
      client_id: clientID,
      client_secret: clientSecret,
    };
    // console.debug(k);
    const resp1 = await fetch(`https://${hostname}/oauth2_token`, {
      method: "POST",
      body: new URLSearchParams(k),
    });
    const resp2: AuthResSucc = await resp1.json();
    // console.debug(resp2);
    if (resp2?.result !== 0) {
      throw Error(`result is not 0 (success) in the end`);
    }
    if (!("access_token" in resp2)) {
      throw Error(`no access_token in the end`);
    }
    return resp2;
  } catch (e) {
    console.error(e);
    if (errorCallBack !== undefined) {
      await errorCallBack(e);
    }
  }
};

export const setConfigBySuccessfullAuthInplace = async (
  config: PCloudConfig,
  authAllowFirstRes: AuthAllowFirstRes,
  authRes: AuthResSucc | undefined,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  if (authRes === undefined) {
    throw Error(`you should not save the setting for undefined result`);
  }

  config.accessToken = authRes.access_token;
  config.hostname = authAllowFirstRes.hostname;
  config.locationid = authAllowFirstRes.locationid;

  // manually set it expired after 80 days;
  config.credentialsShouldBeDeletedAtTimeMs =
    Date.now() + OAUTH2_FORCE_EXPIRE_MILLISECONDS;

  await saveUpdatedConfigFunc?.();

  console.info("finish updating local info of pCloud token");
};

interface PCloudEntity extends Entity {
  id: number;
  parentID: number | undefined;
  parentIDPath: string | undefined;
  isFolder: boolean;
  hashPCloud: number | undefined;
}

interface File {
  contenttype: string;
  created: string;
  fileid: number;
  hash: number;
  id: string; // "f" + fileid
  isfolder: false;
  modified: string;
  name: string;
  parentfolderid: number;
  size: number;
}

interface Folder {
  contents: (Folder | File)[] | undefined;
  id: string; // "d"+folderid
  folderid: number;
  isfolder: true;
  created: string;
  modified: string;
  name: string;
  parentfolderid: number;
}

interface StatRawResponse {
  result: number;
  fileids: number[];
  metadata: (File | Folder)[];
  checksums: { sha1: string; sha256?: string; md5?: string }[] | undefined;
}

const fromRawResponseToEntity = (
  item: Folder | File,
  parentFolderPath: string | undefined /* for bfs */
): PCloudEntity => {
  if (item.parentfolderid === undefined || item.parentfolderid === 0) {
    throw Error(
      `parentfolderid=${item.parentfolderid} should not be in fromRawResponseToEntity`
    );
  }

  let keyRaw = item.name;
  let size = 0;
  let hashPCloud: number | undefined = undefined;
  let hash: string | undefined = undefined;
  let id: number | undefined = undefined;
  if (
    parentFolderPath !== undefined &&
    parentFolderPath !== "" &&
    parentFolderPath !== "/"
  ) {
    if (!parentFolderPath.endsWith("/")) {
      throw Error(
        `parentFolderPath=${parentFolderPath} should not be in fromRawResponseToEntity`
      );
    }
    keyRaw = `${parentFolderPath}${item.name}`;
  }

  if (item.isfolder) {
    keyRaw = `${keyRaw}/`;
    id = item.folderid;
  } else {
    size = item.size;
    hashPCloud = item.hash;
    hash = `${item.hash}`;
    id = item.fileid;
  }

  const mtime = new Date(item.modified).valueOf();

  return {
    key: keyRaw,
    keyRaw: keyRaw,
    mtimeCli: mtime,
    mtimeSvr: mtime,
    id: id,
    parentID: item.parentfolderid,
    isFolder: item.isfolder,
    size: size,
    sizeRaw: size,
    hash: hash,
    hashPCloud: hashPCloud,
    parentIDPath: parentFolderPath,
  };
};

const fromNestedFolderToEntityListAndCache = (
  root: Folder
): { entities: PCloudEntity[]; key2Entity: Record<string, PCloudEntity> } => {
  // console.debug("root:");
  // console.debug(root);

  const entities: PCloudEntity[] = [];
  const key2Entity: Record<string, PCloudEntity> = {};

  if (root.contents === undefined || root.contents.length === 0) {
    // console.debug(`early return`);
    return {
      entities,
      key2Entity,
    };
  }

  let parents: {
    folderPath: string;
    itself: Folder | File;
  }[] = [];
  for (const f of root.contents ?? []) {
    parents.push({
      folderPath: "",
      itself: f,
    });
  }

  while (parents.length !== 0) {
    const children: typeof parents = [];
    for (const { folderPath, itself } of parents) {
      if (itself.isfolder && itself.folderid === root.folderid) {
        // special, ignore root folder itself
      } else {
        const entity = fromRawResponseToEntity(itself, folderPath);
        entities.push(entity);
        key2Entity[entity.keyRaw] = entity;
      }

      if (
        itself.isfolder &&
        itself.contents !== undefined &&
        itself.contents.length > 0
      ) {
        for (const f of itself.contents) {
          if (folderPath === "" || folderPath === "/") {
            const child = {
              itself: f,
              folderPath: `${itself.name}/`,
            };
            children.push(child);
          } else {
            const child = {
              itself: f,
              folderPath: `${folderPath}${itself.name}/`,
            };
            children.push(child);
          }
        }
      }
    }
    parents = children;
  }

  // console.debug("entities:");
  // console.debug(entities);
  // console.debug("key2Entity:");
  // console.debug(key2Entity);

  return {
    entities,
    key2Entity,
  };
};

const getPCloudPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  return `/${remoteBaseDir}/${fileOrFolderPath}`;
};

export class FakeFsPCloud extends FakeFs {
  kind: string;

  pCloudConfig: PCloudConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;

  keyToPCloudEntity: Record<string, PCloudEntity>;
  baseDirID: number;

  client: pcloudSdk.Client;

  constructor(
    pCloudConfig: PCloudConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "pcloud";
    this.pCloudConfig = pCloudConfig;
    this.remoteBaseDir = this.pCloudConfig.remoteBaseDir || vaultName || "";
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.keyToPCloudEntity = {};
    this.baseDirID = 0;

    (global as any).locationid = pCloudConfig.locationid; // why?? pcloud, why??
    this.client = pcloudSdk.createClient(pCloudConfig.accessToken);
  }

  async _init() {
    if (this.vaultFolderExists) {
      // pass
    } else {
      const root = (await this.client.listfolder(0, {
        recursive: false,
      })) as Folder;

      // find?
      if (root.contents === undefined) {
        throw Error(`cannot listfolder of root!`);
      }
      const found = root.contents.filter(
        (x) => x.isfolder && x.name === this.remoteBaseDir
      );
      if (found.length > 0) {
        // we find it!
        const f = found[0] as Folder;
        this.baseDirID = f.folderid;
        this.vaultFolderExists = true;
      } else {
        // not found, let's create it!
        const f: Folder = await this.client.createfolder(this.remoteBaseDir, 0);
        // console.debug(f);
        this.baseDirID = f.folderid;
        this.vaultFolderExists = true;
      }
    }
  }

  async _getAccessToken() {
    if (this.pCloudConfig.accessToken === "") {
      throw Error("The user has not manually auth yet.");
    }

    return this.pCloudConfig.accessToken;

    // TODO: no expire date?
    // https://docs.pcloud.com/methods/intro/authentication.html
  }

  async walk(): Promise<Entity[]> {
    await this._init();
    const rsp = (await this.client.listfolder(this.baseDirID, {
      recursive: true,
    })) as Folder;

    const { entities, key2Entity } = fromNestedFolderToEntityListAndCache(rsp);

    this.keyToPCloudEntity = Object.assign(this.keyToPCloudEntity, key2Entity);

    return entities;
  }

  async walkPartial(): Promise<Entity[]> {
    await this._init();
    const rsp = (await this.client.listfolder(this.baseDirID, {
      recursive: false,
    })) as Folder;
    const { entities, key2Entity } = fromNestedFolderToEntityListAndCache(rsp);

    this.keyToPCloudEntity = Object.assign(this.keyToPCloudEntity, key2Entity);

    return entities;
  }

  async stat(key: string): Promise<Entity> {
    await this._init();

    // TODO: we already have a cache, should we call again?
    const cachedEntity = this.keyToPCloudEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity === undefined || fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    // why? pcloud doesn't have stat api??
    return cachedEntity;
  }

  async mkdir(
    key: string,
    mtime?: number | undefined,
    ctime?: number | undefined
  ): Promise<Entity> {
    if (!key.endsWith("/")) {
      throw Error(`you should not mkdir on key=${key}`);
    }

    await this._init();

    const cachedEntity = this.keyToPCloudEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity !== undefined && fileID !== undefined) {
      return cachedEntity;
    }

    // xxx/ => ["xxx"]
    // xxx/yyy/zzz/ => ["xxx", "xxx/yyy", "xxx/yyy/zzz"]
    const folderLevels = getFolderLevels(key);
    let parentFolderPath: string | undefined = undefined;
    let parentID: number | undefined = undefined;
    if (folderLevels.length === 0) {
      throw Error(`cannot getFolderLevels of ${key}`);
    } else if (folderLevels.length === 1) {
      parentID = this.baseDirID;
      parentFolderPath = ""; // ignore base dir
    } else {
      // length > 1
      parentFolderPath = `${folderLevels[folderLevels.length - 2]}/`;
      if (!(parentFolderPath in this.keyToPCloudEntity)) {
        throw Error(
          `parent of ${key}: ${parentFolderPath} is not created before??`
        );
      }
      parentID = this.keyToPCloudEntity[parentFolderPath].id;
    }

    // xxx/yyy/zzz/ => ["xxx", "xxx/yyy", "xxx/yyy/zzz"] => "xxx/yyy/zzz" => "zzz"
    let folderItselfWithoutSlash = folderLevels[folderLevels.length - 1];
    folderItselfWithoutSlash = folderItselfWithoutSlash.split("/").pop()!;

    const f = await this.client.createfolder(
      folderItselfWithoutSlash,
      parentID
    );

    const entity = fromRawResponseToEntity(f, parentFolderPath);
    // insert into cache
    this.keyToPCloudEntity[key] = entity;
    return entity;
  }

  /**
   * https://docs.pcloud.com/methods/file/uploadfile.html
   */
  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    if (key.endsWith("/")) {
      throw Error(`should not call writeFile on ${key}`);
    }

    await this._init();

    const prevCachedEntity: PCloudEntity | undefined =
      this.keyToPCloudEntity[key];
    const prevFileID: number | undefined = prevCachedEntity?.id;

    let parentID: number | undefined = undefined;
    let parentFolderPath: string | undefined = undefined;

    // "xxx" => []
    // "xxx/yyy/zzz.md" => ["xxx", "xxx/yyy"]
    const folderLevels = getFolderLevels(key);
    if (folderLevels.length === 0) {
      // root
      parentID = this.baseDirID;
      parentFolderPath = "";
    } else {
      parentFolderPath = `${folderLevels[folderLevels.length - 1]}/`;
      if (!(parentFolderPath in this.keyToPCloudEntity)) {
        throw Error(
          `parent of ${key}: ${parentFolderPath} is not created before??`
        );
      }
      parentID = this.keyToPCloudEntity[parentFolderPath].id;
    }

    const fileItself = key.split("/").pop()!;

    // no idea how to use the sdk, let's use https here
    // https://docs.pcloud.com/methods/file/uploadfile.html
    const params = new URLSearchParams({
      access_token: await this._getAccessToken(),
      folderid: `${parentID}`,
      filename: fileItself,
      nopartial: `1`,
      renameifexists: `0`,
      mtime: `${Math.floor(mtime / 1000.0)}`,
      ctime: `${Math.floor(ctime / 1000.0)}`,
    });
    const apiUrl = `https://${this.pCloudConfig.hostname}/uploadfile?${params}`;

    if (content.byteLength > 0) {
      const rsp = await fetch(apiUrl, {
        method: "PUT",
        body: content,
      });
      const f: StatRawResponse = await rsp.json();
      const entity = fromRawResponseToEntity(f.metadata[0], parentFolderPath);
      // console.debug(entity);
      this.keyToPCloudEntity[key] = entity;
      return entity;
    } else {
      // no idea why pcloud doesn't work for empty files
      // it can be uploaded successfully but the call doesn't end
      // we abort it and stat it manually.
      // console.warn(`uploading empty file ${key}`);
      const controller = new AbortController();
      const timeoutMs = 300; // just a random reasonable number
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const rsp = await fetch(apiUrl, {
          method: "PUT",
          body: content,
          signal: controller.signal,
        });
      } catch (e) {
        // console.warn(`we abort the request of uploading empty file ${key}:`);
        // console.warn(e);
      } finally {
        clearTimeout(id);
      }

      // raw stat here
      // https://docs.pcloud.com/methods/file/stat.html
      const params = new URLSearchParams({
        access_token: await this._getAccessToken(),
        path: getPCloudPath(key, this.remoteBaseDir),
      });
      const apiUrlStat = `https://${this.pCloudConfig.hostname}/stat?${params}`;
      const rsp2 = await fetch(apiUrlStat);
      const f = await rsp2.json();
      const entity = fromRawResponseToEntity(f.metadata, parentFolderPath);
      // console.warn(entity);
      this.keyToPCloudEntity[key] = entity;
      return entity;
    }
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    await this._init();
    const cachedEntity = this.keyToPCloudEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity === undefined || fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    const params = new URLSearchParams({
      access_token: await this._getAccessToken(),
      forcedownload: `1`,
      fileid: `${fileID}`,
    });
    const urlMeta = `https://${this.pCloudConfig.hostname}/getfilelink?${params}`;

    // Referrer is restricted to pcloud.com.
    // we need to bypass it
    const meta = (await requestUrl(urlMeta)).json;
    // console.debug(meta);
    const link: string = `https://${meta.hosts[0]}${meta.path}`;
    const rsp = await requestUrl(link);
    const content = rsp.arrayBuffer;
    return content;
  }

  async rename(key1: string, key2: string): Promise<void> {
    await this._init();
    throw new Error("Method not implemented.");
  }

  async rm(key: string): Promise<void> {
    await this._init();

    const cachedEntity = this.keyToPCloudEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity === undefined || fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    if (key.endsWith("/")) {
      await this.client.deletefolder(fileID);
    } else {
      await this.client.deletefile(fileID);
    }
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    // if we can init, we can connect
    try {
      await this._init();
      return true;
    } catch (err) {
      console.debug(err);
      callbackFunc?.(err);
      return false;
    }
  }

  async getUserDisplayName(): Promise<string> {
    await this._init();
    throw new Error("Method not implemented.");
  }

  async revokeAuth(): Promise<any> {
    await this._init();
    throw new Error("Method not implemented.");
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
