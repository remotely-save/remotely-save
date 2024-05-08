import { Dropbox, DropboxAuth } from "dropbox";
import type { DropboxResponse, DropboxResponseError, files } from "dropbox";
import random from "lodash/random";
import {
  COMMAND_CALLBACK_DROPBOX,
  type DropboxConfig,
  type Entity,
  OAUTH2_FORCE_EXPIRE_MILLISECONDS,
} from "./baseTypes";
import { FakeFs } from "./fsAll";
import {
  bufferToArrayBuffer,
  delay,
  getFolderLevels,
  getParentFolder,
  hasEmojiInText,
  headersToRecord,
} from "./misc";

export { Dropbox } from "dropbox";

export const DEFAULT_DROPBOX_CONFIG: DropboxConfig = {
  accessToken: "",
  clientID: process.env.DEFAULT_DROPBOX_APP_KEY ?? "",
  refreshToken: "",
  accessTokenExpiresInSeconds: 0,
  accessTokenExpiresAtTime: 0,
  accountID: "",
  username: "",
  credentialsShouldBeDeletedAtTime: 0,
};

const getDropboxPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
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

const getNormPath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  if (
    !(
      fileOrFolderPath === `/${remoteBaseDir}` ||
      fileOrFolderPath.startsWith(`/${remoteBaseDir}/`)
    )
  ) {
    throw Error(
      `"${fileOrFolderPath}" doesn't starts with "/${remoteBaseDir}/"`
    );
  }
  return fileOrFolderPath.slice(`/${remoteBaseDir}/`.length);
};

const fromDropboxItemToEntity = (
  x:
    | files.FileMetadataReference
    | files.FolderMetadataReference
    | files.DeletedMetadataReference,
  remoteBaseDir: string
): Entity => {
  let key = getNormPath(x.path_display!, remoteBaseDir);
  if (x[".tag"] === "folder" && !key.endsWith("/")) {
    key = `${key}/`;
  }

  if (x[".tag"] === "folder") {
    return {
      key: key,
      keyRaw: key,
      size: 0,
      sizeRaw: 0,
    } as Entity;
  } else if (x[".tag"] === "file") {
    const mtimeCli = Date.parse(x.client_modified).valueOf();
    const mtimeSvr = Date.parse(x.server_modified).valueOf();
    return {
      key: key,
      keyRaw: key,
      mtimeCli: mtimeCli,
      mtimeSvr: mtimeSvr,
      size: x.size,
      sizeRaw: x.size,
      hash: x.content_hash,
    } as Entity;
  } else {
    // x[".tag"] === "deleted"
    throw Error("do not support deleted tag");
  }
};

/**
 * https://github.com/remotely-save/remotely-save/issues/567
 * https://www.dropboxforum.com/t5/Dropbox-API-Support-Feedback/Case-Sensitivity-in-API-2/td-p/191279
 * @param entities
 */
export const fixEntityListCasesInplace = (entities: { key?: string }[]) => {
  for (const iterator of entities) {
    if (iterator.key === undefined) {
      throw Error(`dropbox list should all have key, but meet undefined`);
    }
  }

  entities.sort((a, b) => a.key!.length - b.key!.length);
  // console.log(JSON.stringify(entities,null,2));

  const caseMapping: Record<string, string> = { "": "" };
  for (const e of entities) {
    // console.log(`looking for: ${JSON.stringify(e, null, 2)}`);

    let parentFolder = getParentFolder(e.key!);
    if (parentFolder === "/") {
      parentFolder = "";
    }
    const parentFolderLower = parentFolder.toLocaleLowerCase();
    const segs = e.key!.split("/");
    if (e.key!.endsWith("/")) {
      // folder
      if (caseMapping.hasOwnProperty(parentFolderLower)) {
        const newKey = `${caseMapping[parentFolderLower]}${segs
          .slice(-2)
          .join("/")}`;
        caseMapping[newKey.toLocaleLowerCase()] = newKey;
        e.key = newKey;
        // console.log(JSON.stringify(caseMapping,null,2));
        // continue;
      } else {
        throw Error(`${parentFolder} doesn't have cases record??`);
      }
    } else {
      // file
      if (caseMapping.hasOwnProperty(parentFolderLower)) {
        const newKey = `${caseMapping[parentFolderLower]}${segs
          .slice(-1)
          .join("/")}`;
        e.key = newKey;
        // continue;
      } else {
        throw Error(`${parentFolder} doesn't have cases record??`);
      }
    }
  }

  return entities;
};

////////////////////////////////////////////////////////////////////////////////
// Other usual common methods
////////////////////////////////////////////////////////////////////////////////

interface ErrSubType {
  error: {
    retry_after: number;
  };
}

async function retryReq<T>(
  reqFunc: () => Promise<DropboxResponse<T>>,
  extraHint = ""
): Promise<DropboxResponse<T> | undefined> {
  const waitSeconds = [1, 2, 4, 8]; // hard code exponential backoff
  for (let idx = 0; idx < waitSeconds.length; ++idx) {
    try {
      if (idx !== 0) {
        console.warn(
          `${extraHint === "" ? "" : extraHint + ": "}The ${
            idx + 1
          }-th try starts at time ${Date.now()}`
        );
      }
      return await reqFunc();
    } catch (e: unknown) {
      const err = e as DropboxResponseError<ErrSubType>;
      if (err.status === undefined) {
        // then the err is not DropboxResponseError
        throw err;
      }
      if (err.status !== 429) {
        // then the err is not "too many requests", give up
        throw err;
      }

      if (idx === waitSeconds.length - 1) {
        // the last retry also failed, give up
        throw new Error(
          `${
            extraHint === "" ? "" : extraHint + ": "
          }"429 too many requests", after retrying for ${
            idx + 1
          } times still failed.`
        );
      }

      const headers = headersToRecord(err.headers);
      const svrSec =
        err.error.error.retry_after ||
        Number.parseInt(headers["retry-after"] || "1") ||
        1;
      const fallbackSec = waitSeconds[idx];
      const secMin = Math.max(svrSec, fallbackSec);
      const secMax = Math.max(secMin * 1.8, 2);
      console.warn(
        `${
          extraHint === "" ? "" : extraHint + ": "
        }We have "429 too many requests" error of ${
          idx + 1
        }-th try, at time ${Date.now()}, and wait for ${secMin} ~ ${secMax} seconds to retry. Original info: ${JSON.stringify(
          err.error,
          null,
          2
        )}`
      );
      await delay(random(secMin * 1000, secMax * 1000));
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Dropbox authorization using PKCE
// see https://dropbox.tech/developers/pkce--what-and-why-
////////////////////////////////////////////////////////////////////////////////

export const getAuthUrlAndVerifier = async (
  appKey: string,
  needManualPatse = false
) => {
  const auth = new DropboxAuth({
    clientId: appKey,
  });

  const callback = needManualPatse
    ? undefined
    : `obsidian://${COMMAND_CALLBACK_DROPBOX}`;
  const authUrl = (
    await auth.getAuthenticationUrl(
      callback as any,
      undefined,
      "code",
      "offline",
      undefined,
      "none",
      true
    )
  ).toString();
  const verifier = auth.getCodeVerifier();
  return {
    authUrl: authUrl,
    verifier: verifier,
  };
};

export interface DropboxSuccessAuthRes {
  access_token: string;
  token_type: "bearer";
  expires_in: string;
  refresh_token?: string;
  scope?: string;
  uid?: string;
  account_id?: string;
}

export const sendAuthReq = async (
  appKey: string,
  verifier: string,
  authCode: string,
  errorCallBack: any
) => {
  try {
    const resp1 = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        code: authCode,
        grant_type: "authorization_code",
        code_verifier: verifier,
        client_id: appKey,
        redirect_uri: `obsidian://${COMMAND_CALLBACK_DROPBOX}`,
      }),
    });
    const resp2 = (await resp1.json()) as DropboxSuccessAuthRes;
    return resp2;
  } catch (e) {
    console.error(e);
    if (errorCallBack !== undefined) {
      await errorCallBack(e);
    }
  }
};

export const sendRefreshTokenReq = async (
  appKey: string,
  refreshToken: string
) => {
  try {
    console.info("start auto getting refreshed Dropbox access token.");
    const resp1 = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: appKey,
      }),
    });
    const resp2 = (await resp1.json()) as DropboxSuccessAuthRes;
    console.info("finish auto getting refreshed Dropbox access token.");
    return resp2;
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const setConfigBySuccessfullAuthInplace = async (
  config: DropboxConfig,
  authRes: DropboxSuccessAuthRes,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  console.info("start updating local info of Dropbox token");

  config.accessToken = authRes.access_token;
  config.accessTokenExpiresInSeconds = Number.parseInt(authRes.expires_in);
  config.accessTokenExpiresAtTime =
    Date.now() + Number.parseInt(authRes.expires_in) * 1000 - 10 * 1000;

  // manually set it expired after 80 days;
  config.credentialsShouldBeDeletedAtTime =
    Date.now() + OAUTH2_FORCE_EXPIRE_MILLISECONDS;

  if (authRes.refresh_token !== undefined) {
    config.refreshToken = authRes.refresh_token;
    config.accountID = authRes.account_id!;
  }

  if (saveUpdatedConfigFunc !== undefined) {
    await saveUpdatedConfigFunc();
  }

  console.info("finish updating local info of Dropbox token");
};

////////////////////////////////////////////////////////////////////////////////
// real exported interface
////////////////////////////////////////////////////////////////////////////////

export class FakeFsDropbox extends FakeFs {
  kind: "dropbox";
  dropboxConfig: DropboxConfig;
  remoteBaseDir: string;
  saveUpdatedConfigFunc: () => Promise<any>;
  dropbox!: Dropbox;
  vaultFolderExists: boolean;
  foldersCreatedBefore: Set<string>;

  constructor(
    dropboxConfig: DropboxConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "dropbox";
    this.dropboxConfig = dropboxConfig;
    this.remoteBaseDir = this.dropboxConfig.remoteBaseDir || vaultName || "";
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.vaultFolderExists = false;
    this.foldersCreatedBefore = new Set();
  }

  async _init() {
    // check token
    if (
      this.dropboxConfig.accessToken === "" ||
      this.dropboxConfig.refreshToken === ""
    ) {
      throw Error("The user has not manually auth yet.");
    }
    const currentTs = Date.now();
    const customHeaders = {
      "Cache-Control": "no-cache",
    };
    if (this.dropboxConfig.accessTokenExpiresAtTime > currentTs) {
      this.dropbox = new Dropbox({
        accessToken: this.dropboxConfig.accessToken,
        customHeaders: customHeaders,
      });
    } else {
      if (this.dropboxConfig.refreshToken === "") {
        throw Error(
          "We need to automatically refresh token but none is stored."
        );
      }
      const resp = await sendRefreshTokenReq(
        this.dropboxConfig.clientID,
        this.dropboxConfig.refreshToken
      );

      setConfigBySuccessfullAuthInplace(
        this.dropboxConfig,
        resp,
        this.saveUpdatedConfigFunc
      );
      this.dropbox = new Dropbox({
        accessToken: this.dropboxConfig.accessToken,
        customHeaders: customHeaders,
      });
    }

    // check vault folder
    // console.info(`checking remote has folder /${this.remoteBaseDir}`);
    if (this.vaultFolderExists) {
      // console.info(`already checked, /${this.remoteBaseDir} exist before`)
    } else {
      const res = await this.dropbox.filesListFolder({
        path: "",
        recursive: false,
      });
      for (const item of res.result.entries) {
        if (item.path_display === `/${this.remoteBaseDir}`) {
          this.vaultFolderExists = true;
          break;
        }
      }
      if (!this.vaultFolderExists) {
        console.info(`remote does not have folder /${this.remoteBaseDir}`);

        if (hasEmojiInText(`/${this.remoteBaseDir}`)) {
          throw new Error(
            `/${this.remoteBaseDir}: Error: Dropbox does not support emoji in folder names.`
          );
        }

        await this.dropbox.filesCreateFolderV2({
          path: `/${this.remoteBaseDir}`,
        });
        console.info(`remote folder /${this.remoteBaseDir} created`);
        this.vaultFolderExists = true;
      } else {
        // console.info(`remote folder /${this.remoteBaseDir} exists`);
      }
    }

    return this;
  }

  async walk(): Promise<Entity[]> {
    await this._init();

    let res = await this.dropbox.filesListFolder({
      path: `/${this.remoteBaseDir}`,
      recursive: true,
      include_deleted: false,
      limit: 1000,
    });
    if (res.status !== 200) {
      throw Error(JSON.stringify(res));
    }
    // console.info(res);

    const contents = res.result.entries;
    const unifiedContents = contents
      .filter((x) => x[".tag"] !== "deleted")
      .filter((x) => x.path_display !== `/${this.remoteBaseDir}`)
      .map((x) => fromDropboxItemToEntity(x, this.remoteBaseDir));

    while (res.result.has_more) {
      res = await this.dropbox.filesListFolderContinue({
        cursor: res.result.cursor,
      });
      if (res.status !== 200) {
        throw Error(JSON.stringify(res));
      }

      const contents2 = res.result.entries;
      const unifiedContents2 = contents2
        .filter((x) => x[".tag"] !== "deleted")
        .filter((x) => x.path_display !== `/${this.remoteBaseDir}`)
        .map((x) => fromDropboxItemToEntity(x, this.remoteBaseDir));
      unifiedContents.push(...unifiedContents2);
    }

    fixEntityListCasesInplace(unifiedContents);

    return unifiedContents;
  }

  async stat(key: string): Promise<Entity> {
    await this._init();
    return await this._statFromRoot(getDropboxPath(key, this.remoteBaseDir));
  }

  async _statFromRoot(key: string): Promise<Entity> {
    // if (key === "" || key === "/") {
    //   // filesGetMetadata doesn't support root folder
    //   // we instead try to list files
    //   // if no error occurs, we ensemble a fake result.
    //   const rsp = await retryReq(() =>
    //     client.dropbox.filesListFolder({
    //       path: `/${client.key}`,
    //       recursive: false, // don't need to recursive here
    //     })
    //   );
    //   if (rsp.status !== 200) {
    //     throw Error(JSON.stringify(rsp));
    //   }
    //   return {
    //     key: remotePath,
    //     lastModified: undefined,
    //     size: 0,
    //     remoteType: "dropbox",
    //     etag: undefined,
    //   } as Entity;
    // }

    const rsp = await retryReq(() =>
      this.dropbox.filesGetMetadata({
        path: key,
      })
    );
    if (rsp === undefined) {
      throw Error("dropbox.filesGetMetadata undefinded");
    }
    if (rsp.status !== 200) {
      throw Error(JSON.stringify(rsp));
    }
    return fromDropboxItemToEntity(rsp.result, this.remoteBaseDir);
  }

  async mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity> {
    if (!key.endsWith("/")) {
      throw Error(`you should not call mkdir on ${key}`);
    }
    await this._init();

    const uploadFile = getDropboxPath(key, this.remoteBaseDir);

    return await this._mkdirFromRoot(uploadFile, mtime, ctime);
  }

  async _mkdirFromRoot(
    key: string,
    mtime?: number,
    ctime?: number
  ): Promise<Entity> {
    if (hasEmojiInText(key)) {
      throw new Error(
        `${key}: Error: Dropbox does not support emoji in file / folder names.`
      );
    }
    if (this.foldersCreatedBefore?.has(key)) {
      // created, pass
    } else {
      try {
        await retryReq(
          () =>
            this.dropbox.filesCreateFolderV2({
              path: key,
            }),
          key // just a hint
        );
        this.foldersCreatedBefore?.add(key);
      } catch (e: unknown) {
        const err = e as DropboxResponseError<files.CreateFolderError>;
        if (err.status === undefined) {
          throw err;
        }
        if (err.status === 409) {
          // pass
          this.foldersCreatedBefore?.add(key);
        } else {
          throw err;
        }
      }
    }
    return await this._statFromRoot(key);
  }

  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<Entity> {
    if (key.endsWith("/")) {
      throw Error(`you should not call writeFile on ${key}`);
    }

    await this._init();
    const uploadFile = getDropboxPath(key, this.remoteBaseDir);

    return await this._writeFileFromRoot(
      uploadFile,
      content,
      mtime,
      ctime,
      key
    );
  }

  async _writeFileFromRoot(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number,
    origKey: string
  ): Promise<Entity> {
    if (hasEmojiInText(origKey)) {
      throw new Error(
        `${origKey}: Error: Dropbox does not support emoji in file / folder names.`
      );
    }

    const mtimeFixed = Math.floor(mtime / 1000.0) * 1000;
    const ctimeFixed = Math.floor(ctime / 1000.0) * 1000;
    const mtimeStr = new Date(mtimeFixed)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    // in dropbox, we don't need to create folders before uploading! cool!
    // TODO: filesUploadSession for larger files (>=150 MB)

    await retryReq(
      () =>
        this.dropbox.filesUpload({
          path: key,
          contents: content,
          mode: {
            ".tag": "overwrite",
          },
          client_modified: mtimeStr,
        }),
      origKey // hint
    );

    // we want to mark that parent folders are created
    if (this.foldersCreatedBefore !== undefined) {
      const dirs = getFolderLevels(origKey).map((x) =>
        getDropboxPath(x, this.remoteBaseDir)
      );
      for (const dir of dirs) {
        this.foldersCreatedBefore?.add(dir);
      }
    }
    return await this._statFromRoot(key);
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    await this._init();
    if (key.endsWith("/")) {
      throw new Error(`you should not call readFile on folder ${key}`);
    }
    const downloadFile = getDropboxPath(key, this.remoteBaseDir);
    return await this._readFileFromRoot(downloadFile);
  }

  async _readFileFromRoot(key: string): Promise<ArrayBuffer> {
    const rsp = await retryReq(
      () =>
        this.dropbox.filesDownload({
          path: key,
        }),
      `downloadFromRemoteRaw=${key}`
    );
    if (rsp === undefined) {
      throw Error(`unknown rsp from dropbox download: ${rsp}`);
    }
    if ((rsp.result as any).fileBlob !== undefined) {
      // we get a Blob
      const content = (rsp.result as any).fileBlob as Blob;
      return await content.arrayBuffer();
    } else if ((rsp.result as any).fileBinary !== undefined) {
      // we get a Buffer
      const content = (rsp.result as any).fileBinary as Buffer;
      return bufferToArrayBuffer(content);
    } else {
      throw Error(`unknown rsp from dropbox download: ${rsp}`);
    }
  }

  async rm(key: string): Promise<void> {
    if (key === "/") {
      return;
    }
    const remoteFileName = getDropboxPath(key, this.remoteBaseDir);

    await this._init();
    try {
      await retryReq(
        () =>
          this.dropbox.filesDeleteV2({
            path: remoteFileName,
          }),
        key // just a hint here
      );
    } catch (err) {
      console.error("some error while deleting");
      console.error(err);
    }
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    try {
      await this._init();
      const results = await this._statFromRoot(`/${this.remoteBaseDir}`);
      if (results === undefined) {
        return false;
      }
      return true;
    } catch (err) {
      console.debug(err);
      callbackFunc?.(err);
      return false;
    }
  }

  async getUserDisplayName() {
    await this._init();
    const acct = await this.dropbox.usersGetCurrentAccount();
    return acct.result.name.display_name;
  }

  async revokeAuth() {
    try {
      await this._init();
      await this.dropbox.authTokenRevoke();
      return true;
    } catch (e) {
      return false;
    }
  }
}
