import { nanoid } from "nanoid";
import createClient, { type Middleware } from "openapi-fetch";
import { base64 } from "rfc4648";
import type { Entity } from "../../src/baseTypes";
import { FakeFs } from "../../src/fsAll";
import { getParentFolder } from "../../src/misc";
import {
  COMMAND_CALLBACK_KOOFR,
  KOOFR_CLIENT_ID,
  KOOFR_CLIENT_SECRET,
  type KoofrConfig,
} from "./baseTypesPro";
import type { paths } from "./koofrApi";
import type { components } from "./koofrApi";

type FilesListRecursiveItem = components["schemas"]["FilesListRecursiveItem"];
type FilesFile = components["schemas"]["FilesFile"];

export const DEFAULT_KOOFR_CONFIG: KoofrConfig = {
  accessToken: "",
  accessTokenExpiresInMs: 0,
  accessTokenExpiresAtTimeMs: 0,
  refreshToken: "",
  remoteBaseDir: "",
  credentialsShouldBeDeletedAtTimeMs: 0,
  scope: "",
  api: "https://app.koofr.net",
  mountID: "",
  kind: "koofr",
};

/**
 * https://app.koofr.net/developers
 */
export const generateAuthUrl = (apiAddr: string, hasCallback: boolean) => {
  let callback = `urn:ietf:wg:oauth:2.0:oob`;
  if (hasCallback) {
    callback = `obsidian://${COMMAND_CALLBACK_KOOFR}`;
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: KOOFR_CLIENT_ID ?? "",
    redirect_uri: callback,
    scope: "public",
    state: nanoid(),
  });

  const url = `${apiAddr}/oauth2/auth?${params}`;
  return url;
};

interface AuthResSucc {
  token_type: "Bearer";
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
 * https://app.koofr.net/developers
 */
export const sendAuthReq = async (
  apiAddr: string,
  authCode: string,
  errorCallBack: any,
  hasCallback: boolean
) => {
  let callback = `urn:ietf:wg:oauth:2.0:oob`;
  if (hasCallback) {
    callback = `obsidian://${COMMAND_CALLBACK_KOOFR}`;
  }
  try {
    const k = {
      code: authCode,
      grant_type: "authorization_code",
      client_id: KOOFR_CLIENT_ID ?? "",
      client_secret: KOOFR_CLIENT_SECRET ?? "",
      redirect_uri: callback,
    };
    // console.debug(k);
    const resp1 = await fetch(`${apiAddr}/oauth2/token`, {
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

export const sendRefreshTokenReq = async (
  apiAddr: string,
  refreshToken: string
) => {
  console.debug(`refreshing token`);
  const x = await fetch(`${apiAddr}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: KOOFR_CLIENT_ID ?? "",
      client_secret: KOOFR_CLIENT_SECRET ?? "",
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
  config: KoofrConfig,
  authRes: AuthResSucc,
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

  config.scope = authRes.scope || config.scope;

  // manually set it expired after 60 days;
  config.credentialsShouldBeDeletedAtTimeMs =
    Date.now() + 1000 * 60 * 60 * 24 * 59;

  await saveUpdatedConfigFunc?.();

  console.info("finish updating local info of Koofr token");
};

const getNormPathFromBasedir = (x: string, type: "dir" | "file") => {
  if (x === "/" || x === "") {
    throw Error(`do not know how to deal with path: ${x}`);
  }

  if (!x.startsWith("/")) {
    throw Error(`path returned by koofr should starts with slash: ${x}`);
  }

  if (type === "file") {
    return x.slice(1);
  } else if (type === "dir") {
    return `${x.slice(1)}/`;
  } else {
    throw Error(`do not know how to deal with path and type: ${x}, ${type}`);
  }
};

const getKoofrPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    key = `/${remoteBaseDir}`;
  } else if (fileOrFolderPath.startsWith("/")) {
    console.warn(
      `why the path ${fileOrFolderPath} starts with '/'? but we just go on.`
    );
    key = `/${remoteBaseDir}${fileOrFolderPath}`;
  } else {
    key = `/${remoteBaseDir}/${fileOrFolderPath}`;
  }
  if (key.endsWith("/")) {
    key = key.slice(0, key.length - 1);
  }
  return key;
};

const fromItemToEntity = (x: FilesListRecursiveItem): Entity => {
  if (x.type === "error") {
    throw Error(`cannot understand ${JSON.stringify(x)}`);
  }

  const key = getNormPathFromBasedir(x.path ?? "/", x.file?.type as any);

  if (x.file?.type === "dir" || x.file?.type === "file") {
    return {
      key: key,
      keyRaw: key,
      mtimeCli: x.file.modified,
      mtimeSvr: x.file.modified,
      size: x.file.size,
      sizeRaw: x.file.size,
      hash: x.file.hash,
    } as Entity;
  } else {
    throw Error(`cannot understand ${JSON.stringify(x)}`);
  }
};

const fromFileToEntity = (x: FilesFile, parentPath: string): Entity => {
  const key = getNormPathFromBasedir(`${parentPath}/${x.name}`, x.type as any);
  if (x.type === "dir" || x.type === "file") {
    return {
      key: key,
      keyRaw: key,
      mtimeCli: x.modified,
      mtimeSvr: x.modified,
      size: x.size,
      sizeRaw: x.size,
      hash: x.hash,
    } as Entity;
  } else {
    throw Error(`cannot understand ${JSON.stringify(x)}`);
  }
};

/**
 * https://app.koofr.net/developers
 *
 */
// const getAuthHeader = (email: string, password: string) => {
//   const x = `${email}:${password}`;
//   const y = base64.stringify(new TextEncoder().encode(x));
//   const z = `Basic ${y}`;
//   return z;
// };

// const getAuthMiddleware = (email: string, password: string) => {
//   const authMiddleware: Middleware = {
//     async onRequest(req) {
//       req.headers.set("Authorization", getAuthHeader(email, password));
//       return req;
//     },
//   };
//   return authMiddleware;
// };

const getAuthMiddleware = (
  koofrConfig: KoofrConfig,
  saveUpdatedConfigFunc: any
) => {
  const authMiddleware: Middleware = {
    async onRequest({ request }) {
      const getAccessToken = async () => {
        if (koofrConfig.refreshToken === "") {
          throw Error("The user has not manually auth yet.");
        }

        const ts = Date.now();
        const comp = koofrConfig.accessTokenExpiresAtTimeMs > ts;
        // console.debug(`koofrConfig.accessTokenExpiresAtTimeMs=${koofrConfig.accessTokenExpiresAtTimeMs},ts=${ts},comp=${comp}`)
        if (comp) {
          return koofrConfig.accessToken;
        }

        // refresh
        const k = await sendRefreshTokenReq(
          koofrConfig.api,
          koofrConfig.refreshToken
        );
        koofrConfig.accessToken = k.access_token;
        koofrConfig.accessTokenExpiresInMs = k.expires_in * 1000;
        koofrConfig.accessTokenExpiresAtTimeMs =
          ts + k.expires_in * 1000 - 60 * 2 * 1000;
        await saveUpdatedConfigFunc();
        console.info("Koofr accessToken updated");
        return koofrConfig.accessToken;
      };

      const access = await getAccessToken();
      request.headers.set("Authorization", `Bearer ${access}`);
      return request;
    },
  };
  return authMiddleware;
};

export class FakeFsKoofr extends FakeFs {
  kind: string;
  koofrConfig: KoofrConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;
  client: ReturnType<typeof createClient<paths>>;
  placeID: string;

  constructor(
    koofrConfig: KoofrConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "koofr";
    this.koofrConfig = koofrConfig;
    this.remoteBaseDir = this.koofrConfig.remoteBaseDir || vaultName || "";
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.placeID = this.koofrConfig.mountID;
    const client = createClient<paths>({ baseUrl: this.koofrConfig.api });
    client.use(getAuthMiddleware(this.koofrConfig, saveUpdatedConfigFunc));
    this.client = client;
  }

  async _init() {
    if (this.koofrConfig.refreshToken === "") {
      throw Error(`You have not auth yet!`);
    }

    if (this.placeID === undefined || this.placeID === "") {
      const { data, error } = await this.client.GET("/api/v2.1/places");
      const primaryPlaceID = data?.places.filter((x) => x.isPrimary)[0].id;
      this.placeID = primaryPlaceID ?? "";

      if (this.placeID === "") {
        throw Error(`cannot find primary placeID`);
      }
    }

    if (this.vaultFolderExists) {
      // pass
    } else {
      const { data, error } = await this.client.GET(
        "/api/v2.1/mounts/{mountId}/files/list",
        {
          params: {
            query: {
              path: "/",
            },
            path: {
              mountId: this.placeID,
            },
          },
        }
      );
      const x = data?.files.filter((x) => x.name === this.remoteBaseDir);
      if ((x?.length ?? 0) > 0) {
        this.vaultFolderExists = true;
      } else {
        const { data, error } = await this.client.POST(
          "/api/v2.1/mounts/{mountId}/files/folder",
          {
            params: {
              query: { path: "/" },
              path: { mountId: this.placeID },
            },
            body: {
              name: this.remoteBaseDir,
            },
          }
        );
        if (data !== undefined) {
          this.vaultFolderExists = true;
        } else {
          throw Error(JSON.stringify(error));
        }
      }
    }
  }

  async walk(): Promise<Entity[]> {
    await this._init();
    const { data, error } = await this.client.GET(
      "/content/api/v2.1/mounts/{mountId}/files/listrecursive",
      {
        params: {
          query: { path: this.remoteBaseDir },
          path: { mountId: this.placeID },
        },
        parseAs: "text",
      }
    );
    if (error !== undefined) {
      throw Error(JSON.stringify(error));
    }
    const items = JSON.parse(
      `[${data.trim().split("\n").join(",")}]`
    ) as FilesListRecursiveItem[];
    const entities = items.filter((x) => x.path !== "/").map(fromItemToEntity);
    return entities;
  }

  async walkPartial(): Promise<Entity[]> {
    await this._init();

    const { data, error } = await this.client.GET(
      "/api/v2.1/mounts/{mountId}/files/list",
      {
        params: {
          query: { path: this.remoteBaseDir },
          path: { mountId: this.placeID },
        },
      }
    );
    if (error !== undefined) {
      throw Error(JSON.stringify(error));
    }
    const entities = data.files.map((x) => fromFileToEntity(x, ""));
    // console.debug(entities);
    return entities;
  }

  async stat(key: string): Promise<Entity> {
    await this._init();
    const { data, error } = await this.client.GET(
      "/api/v2.1/mounts/{mountId}/files/info",
      {
        params: {
          query: { path: getKoofrPath(key, this.remoteBaseDir) },
          path: { mountId: this.placeID },
        },
      }
    );
    if (error !== undefined) {
      throw Error(JSON.stringify(error));
    }
    const entity = fromFileToEntity(
      data,
      getKoofrPath(getParentFolder(key), this.remoteBaseDir)
    );
    // console.debug(entity);
    return entity;
  }

  async mkdir(
    key: string,
    mtime?: number | undefined,
    ctime?: number | undefined
  ): Promise<Entity> {
    await this._init();

    // "abc/efg" -> "abc/"
    const parent = getParentFolder(key);
    const itself = key.slice(0, -1).split("/").pop()!;
    const { data, error } = await this.client.POST(
      "/api/v2.1/mounts/{mountId}/files/folder",
      {
        params: {
          query: { path: getKoofrPath(parent, this.remoteBaseDir) },
          path: { mountId: this.placeID },
        },
        body: {
          name: itself,
        },
      }
    );
    if (error !== undefined) {
      throw Error(JSON.stringify(error));
    }
    return this.stat(key);
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    await this._init();
    const itself = key.split("/").pop()!;
    const { data, error } = await this.client.POST(
      "/content/api/v2.1/mounts/{mountId}/files/put",
      {
        params: {
          query: {
            path: getKoofrPath(getParentFolder(key), this.remoteBaseDir),
            filename: itself,
            info: true,
            overwrite: true,
            autorename: false,
            modified: mtime,
          },
          path: { mountId: this.placeID },
        },

        body: content as any,
        bodySerializer(body) {
          return body;
        },
      }
    );
    if (error !== undefined) {
      throw Error(JSON.stringify(error));
    }
    const entity = fromFileToEntity(
      data,
      getKoofrPath(getParentFolder(key), this.remoteBaseDir)
    );
    // console.debug(entity);
    return entity;
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    await this._init();
    const { data, error } = await this.client.GET(
      "/content/api/v2.1/mounts/{mountId}/files/get",
      {
        params: {
          query: { path: getKoofrPath(key, this.remoteBaseDir), force: true },
          path: { mountId: this.placeID },
        },
        parseAs: "arrayBuffer",
      }
    );
    if (error !== undefined) {
      throw Error(JSON.stringify(error));
    }
    return data;
  }

  async rename(key1: string, key2: string): Promise<void> {
    await this._init();
    throw new Error("Method not implemented.");
  }

  async rm(key: string): Promise<void> {
    await this._init();
    const { data, error } = await this.client.DELETE(
      "/api/v2.1/mounts/{mountId}/files/remove",
      {
        params: {
          query: { path: getKoofrPath(key, this.remoteBaseDir), force: true },
          path: { mountId: this.placeID },
        },
      }
    );
    if (error !== undefined) {
      throw Error(JSON.stringify(error));
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
    throw new Error("Method not implemented.");
  }

  async revokeAuth(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
