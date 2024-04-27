import type {
  DriveItem,
  FileSystemInfo,
  UploadSession,
  User,
} from "@microsoft/microsoft-graph-types";
import { CryptoProvider, PublicClientApplication } from "@azure/msal-node";
import { AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import cloneDeep from "lodash/cloneDeep";
import { request, requestUrl } from "obsidian";
import {
  COMMAND_CALLBACK_ONEDRIVE,
  DEFAULT_CONTENT_TYPE,
  Entity,
  OAUTH2_FORCE_EXPIRE_MILLISECONDS,
  OnedriveConfig,
} from "./baseTypes";
import { VALID_REQURL } from "./baseTypesObs";
import { FakeFs } from "./fsAll";
import { bufferToArrayBuffer } from "./misc";

const SCOPES = ["User.Read", "Files.ReadWrite.AppFolder", "offline_access"];
const REDIRECT_URI = `obsidian://${COMMAND_CALLBACK_ONEDRIVE}`;

export const DEFAULT_ONEDRIVE_CONFIG: OnedriveConfig = {
  accessToken: "",
  clientID: process.env.DEFAULT_ONEDRIVE_CLIENT_ID ?? "",
  authority: process.env.DEFAULT_ONEDRIVE_AUTHORITY ?? "",
  refreshToken: "",
  accessTokenExpiresInSeconds: 0,
  accessTokenExpiresAtTime: 0,
  deltaLink: "",
  username: "",
  credentialsShouldBeDeletedAtTime: 0,
};

////////////////////////////////////////////////////////////////////////////////
// Onedrive authorization using PKCE
////////////////////////////////////////////////////////////////////////////////

export async function getAuthUrlAndVerifier(
  clientID: string,
  authority: string
) {
  const cryptoProvider = new CryptoProvider();
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes();

  const pkceCodes = {
    challengeMethod: "S256", // Use SHA256 Algorithm
    verifier: verifier,
    challenge: challenge,
  };

  const authCodeUrlParams = {
    redirectUri: REDIRECT_URI,
    scopes: SCOPES,
    codeChallenge: pkceCodes.challenge, // PKCE Code Challenge
    codeChallengeMethod: pkceCodes.challengeMethod, // PKCE Code Challenge Method
  };

  const pca = new PublicClientApplication({
    auth: {
      clientId: clientID,
      authority: authority,
    },
  });
  const authCodeUrl = await pca.getAuthCodeUrl(authCodeUrlParams);

  return {
    authUrl: authCodeUrl,
    verifier: verifier,
  };
}

/**
 * Check doc from
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
 * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online#code-flow
 */
export interface AccessCodeResponseSuccessfulType {
  token_type: "Bearer" | "bearer";
  expires_in: number;
  ext_expires_in?: number;
  scope: string;
  access_token: string;
  refresh_token?: string;
  id_token?: string;
}
export interface AccessCodeResponseFailedType {
  error: string;
  error_description: string;
  error_codes: number[];
  timestamp: string;
  trace_id: string;
  correlation_id: string;
}

export const sendAuthReq = async (
  clientID: string,
  authority: string,
  authCode: string,
  verifier: string,
  errorCallBack: any
) => {
  // // original code snippets for references
  // const authResponse = await pca.acquireTokenByCode({
  //   redirectUri: REDIRECT_URI,
  //   scopes: SCOPES,
  //   code: authCode,
  //   codeVerifier: verifier, // PKCE Code Verifier
  // });
  // console.info('authResponse')
  // console.info(authResponse)
  // return authResponse;

  // Because of the CORS problem,
  // we need to construct raw request using Obsidian request,
  // instead of using msal
  // https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
  // https://docs.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online#code-flow
  try {
    const rsp1 = await request({
      url: `${authority}/oauth2/v2.0/token`,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({
        tenant: "consumers",
        client_id: clientID,
        scope: SCOPES.join(" "),
        code: authCode,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
    });

    const rsp2 = JSON.parse(rsp1);
    // console.info(rsp2);

    if (rsp2.error !== undefined) {
      return rsp2 as AccessCodeResponseFailedType;
    } else {
      return rsp2 as AccessCodeResponseSuccessfulType;
    }
  } catch (e) {
    console.error(e);
    await errorCallBack(e);
  }
};

export const sendRefreshTokenReq = async (
  clientID: string,
  authority: string,
  refreshToken: string
) => {
  // also use Obsidian request to bypass CORS issue.
  try {
    const rsp1 = await request({
      url: `${authority}/oauth2/v2.0/token`,
      method: "POST",
      contentType: "application/x-www-form-urlencoded",
      body: new URLSearchParams({
        tenant: "consumers",
        client_id: clientID,
        scope: SCOPES.join(" "),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
    });

    const rsp2 = JSON.parse(rsp1);
    // console.info(rsp2);

    if (rsp2.error !== undefined) {
      return rsp2 as AccessCodeResponseFailedType;
    } else {
      return rsp2 as AccessCodeResponseSuccessfulType;
    }
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const setConfigBySuccessfullAuthInplace = async (
  config: OnedriveConfig,
  authRes: AccessCodeResponseSuccessfulType,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  console.info("start updating local info of OneDrive token");
  config.accessToken = authRes.access_token;
  config.accessTokenExpiresAtTime =
    Date.now() + authRes.expires_in - 5 * 60 * 1000;
  config.accessTokenExpiresInSeconds = authRes.expires_in;
  config.refreshToken = authRes.refresh_token!;

  // manually set it expired after 80 days;
  config.credentialsShouldBeDeletedAtTime =
    Date.now() + OAUTH2_FORCE_EXPIRE_MILLISECONDS;

  if (saveUpdatedConfigFunc !== undefined) {
    await saveUpdatedConfigFunc();
  }

  console.info("finish updating local info of Onedrive token");
};

////////////////////////////////////////////////////////////////////////////////
// Other usual common methods
////////////////////////////////////////////////////////////////////////////////

const getOnedrivePath = (fileOrFolderPath: string, remoteBaseDir: string) => {
  // https://docs.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder?view=odsp-graph-online
  const prefix = `/drive/special/approot:/${remoteBaseDir}`;

  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    return prefix;
  }
  if (key.endsWith("/")) {
    key = key.slice(0, key.length - 1);
  }

  if (key.startsWith("/")) {
    console.warn(`why the path ${key} starts with '/'? but we just go on.`);
    key = `${prefix}${key}`;
  } else {
    key = `${prefix}/${key}`;
  }
  return key;
};

const constructFromDriveItemToEntityError = (x: DriveItem) => {
  return `parentPath="${
    x.parentReference?.path ?? "(no parentReference or path)"
  }", selfName="${x.name}"`;
};

const fromDriveItemToEntity = (x: DriveItem, remoteBaseDir: string): Entity => {
  let key = "";

  // possible prefix:
  // pure english: /drive/root:/Apps/remotely-save/${remoteBaseDir}
  // or localized, e.g.: /drive/root:/应用/remotely-save/${remoteBaseDir}
  const FIRST_COMMON_PREFIX_REGEX = /^\/drive\/root:\/[^\/]+\/remotely-save\//g;

  // why?? /drive/root:/Apps/Graph
  const FIFTH_COMMON_PREFIX_REGEX = /^\/drive\/root:\/[^\/]+\/Graph\//g;

  // or the root is absolute path /Livefolders,
  // e.g.: /Livefolders/应用/remotely-save/${remoteBaseDir}
  const SECOND_COMMON_PREFIX_REGEX = /^\/Livefolders\/[^\/]+\/remotely-save\//g;

  // another report, why???
  // /drive/root:/something/app/remotely-save/${remoteBaseDir}
  const THIRD_COMMON_PREFIX_REGEX =
    /^\/drive\/root:\/[^\/]+\/app\/remotely-save\//g;

  // another possibile prefix
  const FOURTH_COMMON_PREFIX_RAW = `/drive/items/`;

  if (
    x.parentReference === undefined ||
    x.parentReference === null ||
    x.parentReference.path === undefined ||
    x.parentReference.path === null
  ) {
    throw Error("x.parentReference.path is undefinded or null");
  }
  const fullPathOriginal = `${x.parentReference.path}/${x.name}`;
  const matchFirstPrefixRes = fullPathOriginal.match(FIRST_COMMON_PREFIX_REGEX);
  const matchFifthPrefixRes = fullPathOriginal.match(FIFTH_COMMON_PREFIX_REGEX);
  const matchSecondPrefixRes = fullPathOriginal.match(
    SECOND_COMMON_PREFIX_REGEX
  );
  const matchThirdPrefixRes = fullPathOriginal.match(THIRD_COMMON_PREFIX_REGEX);
  if (
    matchFirstPrefixRes !== null &&
    fullPathOriginal.startsWith(`${matchFirstPrefixRes[0]}${remoteBaseDir}`)
  ) {
    const foundPrefix = `${matchFirstPrefixRes[0]}${remoteBaseDir}`;
    key = fullPathOriginal.substring(foundPrefix.length + 1);
  } else if (
    matchFifthPrefixRes !== null &&
    fullPathOriginal.startsWith(`${matchFifthPrefixRes[0]}${remoteBaseDir}`)
  ) {
    const foundPrefix = `${matchFifthPrefixRes[0]}${remoteBaseDir}`;
    key = fullPathOriginal.substring(foundPrefix.length + 1);
  } else if (
    matchSecondPrefixRes !== null &&
    fullPathOriginal.startsWith(`${matchSecondPrefixRes[0]}${remoteBaseDir}`)
  ) {
    const foundPrefix = `${matchSecondPrefixRes[0]}${remoteBaseDir}`;
    key = fullPathOriginal.substring(foundPrefix.length + 1);
  } else if (
    matchThirdPrefixRes !== null &&
    fullPathOriginal.startsWith(`${matchThirdPrefixRes[0]}${remoteBaseDir}`)
  ) {
    const foundPrefix = `${matchThirdPrefixRes[0]}${remoteBaseDir}`;
    key = fullPathOriginal.substring(foundPrefix.length + 1);
  } else if (x.parentReference.path.startsWith(FOURTH_COMMON_PREFIX_RAW)) {
    // it's something like
    // /drive/items/<some_id>!<another_id>:/${remoteBaseDir}/<subfolder>
    // with uri encoded!
    if (x.name === undefined || x.name === null) {
      throw Error(
        `OneDrive item no name variable while matching ${FOURTH_COMMON_PREFIX_RAW}`
      );
    }
    const parPath = decodeURIComponent(x.parentReference.path);
    key = parPath.substring(parPath.indexOf(":") + 1);
    if (key.startsWith(`/${remoteBaseDir}/`)) {
      key = key.substring(`/${remoteBaseDir}/`.length);
      key = `${key}/${x.name}`;
    } else if (key === `/${remoteBaseDir}`) {
      key = x.name;
    } else {
      throw Error(
        `we meet file/folder and do not know how to deal with it:\n${constructFromDriveItemToEntityError(
          x
        )}`
      );
    }
  } else {
    throw Error(
      `we meet file/folder and do not know how to deal with it:\n${constructFromDriveItemToEntityError(
        x
      )}`
    );
  }

  const isFolder = "folder" in x;
  if (isFolder) {
    key = `${key}/`;
  }

  const mtimeSvr = Date.parse(x?.fileSystemInfo!.lastModifiedDateTime!);
  const mtimeCli = Date.parse(x?.fileSystemInfo!.lastModifiedDateTime!);
  return {
    key: key,
    keyRaw: key,
    mtimeSvr: mtimeSvr,
    mtimeCli: mtimeCli,
    size: isFolder ? 0 : x.size!,
    sizeRaw: isFolder ? 0 : x.size!,
    // hash: ?? // TODO
  };
};

////////////////////////////////////////////////////////////////////////////////
// The client.
////////////////////////////////////////////////////////////////////////////////

// to adapt to the required interface
class MyAuthProvider implements AuthenticationProvider {
  onedriveConfig: OnedriveConfig;
  saveUpdatedConfigFunc: () => Promise<any>;
  constructor(
    onedriveConfig: OnedriveConfig,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    this.onedriveConfig = onedriveConfig;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
  }

  async getAccessToken() {
    if (
      this.onedriveConfig.accessToken === "" ||
      this.onedriveConfig.refreshToken === ""
    ) {
      throw Error("The user has not manually auth yet.");
    }

    const currentTs = Date.now();
    if (this.onedriveConfig.accessTokenExpiresAtTime > currentTs) {
      return this.onedriveConfig.accessToken;
    } else {
      // use refreshToken to refresh
      const r = await sendRefreshTokenReq(
        this.onedriveConfig.clientID,
        this.onedriveConfig.authority,
        this.onedriveConfig.refreshToken
      );
      if ((r as any).error !== undefined) {
        const r2 = r as AccessCodeResponseFailedType;
        throw Error(
          `Error while refreshing accessToken: ${r2.error}, ${r2.error_codes}: ${r2.error_description}`
        );
      }
      const r2 = r as AccessCodeResponseSuccessfulType;
      this.onedriveConfig.accessToken = r2.access_token;
      this.onedriveConfig.refreshToken = r2.refresh_token!;
      this.onedriveConfig.accessTokenExpiresInSeconds = r2.expires_in;
      this.onedriveConfig.accessTokenExpiresAtTime =
        currentTs + r2.expires_in * 1000 - 60 * 2 * 1000;
      await this.saveUpdatedConfigFunc();
      console.info("Onedrive accessToken updated");
      return this.onedriveConfig.accessToken;
    }
  }
}

/**
 * to export the settings in qrcode,
 * we want to "trim" or "shrink" the settings
 * @param onedriveConfig
 */
export const getShrinkedSettings = (onedriveConfig: OnedriveConfig) => {
  const config = cloneDeep(onedriveConfig);
  config.accessToken = "x";
  config.accessTokenExpiresInSeconds = 1;
  config.accessTokenExpiresAtTime = 1;
  return config;
};

export class FakeFsOnedrive extends FakeFs {
  kind: "onedrive";
  onedriveConfig: OnedriveConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  authGetter: MyAuthProvider;
  saveUpdatedConfigFunc: () => Promise<any>;
  foldersCreatedBefore: Set<string>;

  constructor(
    onedriveConfig: OnedriveConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "onedrive";
    this.onedriveConfig = onedriveConfig;
    this.remoteBaseDir = this.onedriveConfig.remoteBaseDir || vaultName || "";
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.authGetter = new MyAuthProvider(onedriveConfig, saveUpdatedConfigFunc);
    this.foldersCreatedBefore = new Set();
  }

  async _init() {
    // check token
    if (
      this.onedriveConfig.accessToken === "" ||
      this.onedriveConfig.refreshToken === ""
    ) {
      throw Error("The user has not manually auth yet.");
    }

    // check vault folder
    // console.info(`checking remote has folder /${this.remoteBaseDir}`);
    if (this.vaultFolderExists) {
      // console.info(`already checked, /${this.remoteBaseDir} exist before`)
    } else {
      const k = await this._getJson("/drive/special/approot/children");
      // console.debug(k);
      this.vaultFolderExists =
        (k.value as DriveItem[]).filter((x) => x.name === this.remoteBaseDir)
          .length > 0;
      if (!this.vaultFolderExists) {
        console.info(`remote does not have folder /${this.remoteBaseDir}`);
        await this._postJson("/drive/special/approot/children", {
          name: `${this.remoteBaseDir}`,
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        });
        console.info(`remote folder /${this.remoteBaseDir} created`);
        this.vaultFolderExists = true;
      } else {
        // console.info(`remote folder /${this.remoteBaseDir} exists`);
      }
    }
  }

  _buildUrl(pathFragOrig: string) {
    const API_PREFIX = "https://graph.microsoft.com/v1.0";
    let theUrl = "";
    if (
      pathFragOrig.startsWith("http://") ||
      pathFragOrig.startsWith("https://")
    ) {
      theUrl = pathFragOrig;
    } else {
      const pathFrag = encodeURI(pathFragOrig);
      theUrl = `${API_PREFIX}${pathFrag}`;
    }
    // we want to support file name with hash #
    // because every url we construct here do not contain the # symbol
    // thus it should be safe to directly replace the character
    theUrl = theUrl.replace(/#/g, "%23");
    // console.debug(`building url: [${pathFragOrig}] => [${theUrl}]`)
    return theUrl;
  }

  async _getJson(pathFragOrig: string) {
    const theUrl = this._buildUrl(pathFragOrig);
    console.debug(`getJson, theUrl=${theUrl}`);
    return JSON.parse(
      await request({
        url: theUrl,
        method: "GET",
        contentType: "application/json",
        headers: {
          Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
          "Cache-Control": "no-cache",
        },
      })
    );
  }

  async _postJson(pathFragOrig: string, payload: any) {
    const theUrl = this._buildUrl(pathFragOrig);
    console.debug(`postJson, theUrl=${theUrl}`);
    return JSON.parse(
      await request({
        url: theUrl,
        method: "POST",
        contentType: "application/json",
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
        },
      })
    );
  }

  async _patchJson(pathFragOrig: string, payload: any) {
    const theUrl = this._buildUrl(pathFragOrig);
    console.debug(`patchJson, theUrl=${theUrl}`);
    return JSON.parse(
      await request({
        url: theUrl,
        method: "PATCH",
        contentType: "application/json",
        body: JSON.stringify(payload),
        headers: {
          Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
        },
      })
    );
  }

  async _deleteJson(pathFragOrig: string) {
    const theUrl = this._buildUrl(pathFragOrig);
    console.debug(`deleteJson, theUrl=${theUrl}`);
    if (VALID_REQURL) {
      await requestUrl({
        url: theUrl,
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
        },
      });
    } else {
      await fetch(theUrl, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
        },
      });
    }
  }

  async _putArrayBuffer(pathFragOrig: string, payload: ArrayBuffer) {
    const theUrl = this._buildUrl(pathFragOrig);
    console.debug(`putArrayBuffer, theUrl=${theUrl}`);
    // TODO:
    // 20220401: On Android, requestUrl has issue that text becomes base64.
    // Use fetch everywhere instead!
    if (false /*VALID_REQURL*/) {
      const res = await requestUrl({
        url: theUrl,
        method: "PUT",
        body: payload,
        contentType: DEFAULT_CONTENT_TYPE,
        headers: {
          "Content-Type": DEFAULT_CONTENT_TYPE,
          Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
        },
      });
      return res.json as DriveItem | UploadSession;
    } else {
      const res = await fetch(theUrl, {
        method: "PUT",
        body: payload,
        headers: {
          "Content-Type": DEFAULT_CONTENT_TYPE,
          Authorization: `Bearer ${await this.authGetter.getAccessToken()}`,
        },
      });
      return (await res.json()) as DriveItem | UploadSession;
    }
  }

  /**
   * A specialized function to upload large files by parts
   * @param pathFragOrig
   * @param payload
   * @param rangeMin
   * @param rangeEnd the end, exclusive
   * @param size
   */
  async _putUint8ArrayByRange(
    pathFragOrig: string,
    payload: Uint8Array,
    rangeStart: number,
    rangeEnd: number,
    size: number
  ) {
    const theUrl = this._buildUrl(pathFragOrig);
    console.debug(
      `putUint8ArrayByRange, theUrl=${theUrl}, range=${rangeStart}-${
        rangeEnd - 1
      }, len=${rangeEnd - rangeStart}, size=${size}`
    );
    // NO AUTH HEADER here!
    // TODO:
    // 20220401: On Android, requestUrl has issue that text becomes base64.
    // Use fetch everywhere instead!
    if (false /*VALID_REQURL*/) {
      const res = await requestUrl({
        url: theUrl,
        method: "PUT",
        body: bufferToArrayBuffer(payload.subarray(rangeStart, rangeEnd)),
        contentType: DEFAULT_CONTENT_TYPE,
        headers: {
          // no "Content-Length" allowed here
          "Content-Range": `bytes ${rangeStart}-${rangeEnd - 1}/${size}`,
          /* "Cache-Control": "no-cache", not allowed here!!! */
        },
      });
      return res.json as DriveItem | UploadSession;
    } else {
      const res = await fetch(theUrl, {
        method: "PUT",
        body: payload.subarray(rangeStart, rangeEnd),
        headers: {
          "Content-Length": `${rangeEnd - rangeStart}`,
          "Content-Range": `bytes ${rangeStart}-${rangeEnd - 1}/${size}`,
          "Content-Type": DEFAULT_CONTENT_TYPE,
          /* "Cache-Control": "no-cache", not allowed here!!! */
        },
      });
      return (await res.json()) as DriveItem | UploadSession;
    }
  }

  /**
   * Use delta api to list all files and folders
   * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_delta?view=odsp-graph-online
   */
  async walk(): Promise<Entity[]> {
    await this._init();

    const NEXT_LINK_KEY = "@odata.nextLink";
    const DELTA_LINK_KEY = "@odata.deltaLink";

    let res = await this._getJson(
      `/drive/special/approot:/${this.remoteBaseDir}:/delta`
    );
    let driveItems = res.value as DriveItem[];
    // console.debug(driveItems);

    while (NEXT_LINK_KEY in res) {
      res = await this._getJson(res[NEXT_LINK_KEY]);
      driveItems.push(...cloneDeep(res.value as DriveItem[]));
    }

    // lastly we should have delta link?
    if (DELTA_LINK_KEY in res) {
      this.onedriveConfig.deltaLink = res[DELTA_LINK_KEY];
      await this.saveUpdatedConfigFunc();
    }

    // unify everything to Entity
    const unifiedContents = driveItems
      .map((x) => fromDriveItemToEntity(x, this.remoteBaseDir))
      .filter((x) => x.key !== "/");

    return unifiedContents;
  }

  async stat(key: string): Promise<Entity> {
    await this._init();
    return await this._statFromRoot(getOnedrivePath(key, this.remoteBaseDir));
  }

  async _statFromRoot(key: string): Promise<Entity> {
    // console.info(`remotePath=${remotePath}`);
    const rsp = await this._getJson(
      `${key}?$select=cTag,eTag,fileSystemInfo,folder,file,name,parentReference,size`
    );
    // console.info(rsp);
    const driveItem = rsp as DriveItem;
    const res = fromDriveItemToEntity(driveItem, this.remoteBaseDir);
    // console.info(res);
    return res;
  }

  async mkdir(key: string, mtime?: number, ctime?: number): Promise<Entity> {
    if (!key.endsWith("/")) {
      throw Error(`you should not call mkdir on ${key}`);
    }
    await this._init();
    const uploadFolder = getOnedrivePath(key, this.remoteBaseDir);
    console.debug(`mkdir uploadFolder=${uploadFolder}`);
    return await this._mkdirFromRoot(uploadFolder, mtime, ctime);
  }

  async _mkdirFromRoot(
    key: string,
    mtime?: number,
    ctime?: number
  ): Promise<Entity> {
    // console.debug(`foldersCreatedBefore=${Array.from(this.foldersCreatedBefore)}`);
    if (this.foldersCreatedBefore.has(key)) {
      // created, pass
      // console.debug(`folder ${key} created.`)
    } else {
      // https://stackoverflow.com/questions/56479865/creating-nested-folders-in-one-go-onedrive-api
      // use PATCH to create folder recursively!!!
      let playload: any = {
        folder: {},
        "@microsoft.graph.conflictBehavior": "replace",
      };
      const fileSystemInfo: Record<string, string> = {};
      if (mtime !== undefined && mtime !== 0) {
        const mtimeStr = new Date(mtime).toISOString();
        fileSystemInfo["lastModifiedDateTime"] = mtimeStr;
      }
      if (ctime !== undefined && ctime !== 0) {
        const ctimeStr = new Date(ctime).toISOString();
        fileSystemInfo["createdDateTime"] = ctimeStr;
      }
      if (Object.keys(fileSystemInfo).length > 0) {
        playload["fileSystemInfo"] = fileSystemInfo;
      }
      await this._patchJson(key, playload);
    }
    const res = await this._statFromRoot(key);
    return res;
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
    const uploadFile = getOnedrivePath(key, this.remoteBaseDir);
    console.debug(`uploadFile=${uploadFile}`);
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
    if (content.byteLength === 0) {
      throw Error(
        `${origKey}: Empty file is not allowed in OneDrive, and please write something in it.`
      );
    }

    const ctimeStr = new Date(ctime).toISOString();
    const mtimeStr = new Date(mtime).toISOString();

    // no need to create parent folders firstly, cool!

    // hard code range size
    const MIN_UNIT = 327680; // bytes in msft doc, about 0.32768 MB
    const RANGE_SIZE = MIN_UNIT * 20; // about 6.5536 MB
    const DIRECT_UPLOAD_MAX_SIZE = 1000 * 1000 * 4; // 4 Megabyte

    if (content.byteLength < DIRECT_UPLOAD_MAX_SIZE) {
      // directly using put!
      await this._putArrayBuffer(
        `${key}:/content?${new URLSearchParams({
          "@microsoft.graph.conflictBehavior": "replace",
        })}`,
        content
      );
      if (mtime !== 0 && ctime !== 0) {
        await this._patchJson(key, {
          fileSystemInfo: {
            lastModifiedDateTime: mtimeStr,
            createdDateTime: ctimeStr,
          } as FileSystemInfo,
        });
      }
    } else {
      // upload large files!
      // ref: https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_createuploadsession?view=odsp-graph-online

      // 1. create uploadSession
      // uploadFile already starts with /drive/special/approot:/${remoteBaseDir}
      let playload: any = {
        item: {
          "@microsoft.graph.conflictBehavior": "replace",
        },
      };
      if (mtime !== 0 && ctime !== 0) {
        playload = {
          item: {
            "@microsoft.graph.conflictBehavior": "replace",

            // this is only possible using uploadSession
            fileSystemInfo: {
              lastModifiedDateTime: mtimeStr,
              createdDateTime: ctimeStr,
            } as FileSystemInfo,
          },
        };
      }
      const s: UploadSession = await this._postJson(
        `${key}:/createUploadSession`,
        playload
      );
      const uploadUrl = s.uploadUrl!;
      console.debug("uploadSession = ");
      console.debug(s);

      // 2. upload by ranges
      // convert to uint8
      const uint8 = new Uint8Array(content);

      // upload the ranges one by one
      let rangeStart = 0;
      while (rangeStart < uint8.byteLength) {
        await this._putUint8ArrayByRange(
          uploadUrl,
          uint8,
          rangeStart,
          Math.min(rangeStart + RANGE_SIZE, uint8.byteLength),
          uint8.byteLength
        );
        rangeStart += RANGE_SIZE;
      }
    }

    const res = await this._statFromRoot(key);
    return res;
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    await this._init();
    if (key.endsWith("/")) {
      throw new Error(`you should not call readFile on folder ${key}`);
    }
    const downloadFile = getOnedrivePath(key, this.remoteBaseDir);
    return await this._readFileFromRoot(downloadFile);
  }

  async _readFileFromRoot(key: string): Promise<ArrayBuffer> {
    const rsp = await this._getJson(
      `${key}?$select=@microsoft.graph.downloadUrl`
    );
    const downloadUrl: string = rsp["@microsoft.graph.downloadUrl"];
    if (VALID_REQURL) {
      const content = (
        await requestUrl({
          url: downloadUrl,
          headers: { "Cache-Control": "no-cache" },
        })
      ).arrayBuffer;
      return content;
    } else {
      // cannot set no-cache here, will have cors error
      const content = await (await fetch(downloadUrl)).arrayBuffer();
      return content;
    }
  }

  async rm(key: string): Promise<void> {
    if (key === "" || key === "/") {
      return;
    }
    const remoteFileName = getOnedrivePath(key, this.remoteBaseDir);

    await this._init();
    await this._deleteJson(remoteFileName);
  }

  async checkConnect(callbackFunc?: any): Promise<boolean> {
    try {
      const k = await this.getUserDisplayName();
      return k !== "<unknown display name>";
    } catch (err) {
      console.debug(err);
      callbackFunc?.(err);
      return false;
    }
  }

  async getUserDisplayName() {
    await this._init();
    const res: User = await this._getJson("/me?$select=displayName");
    return res.displayName || "<unknown display name>";
  }

  /**
   *
   * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-protocols-oidc#send-a-sign-out-request
   * https://docs.microsoft.com/en-us/graph/api/user-revokesigninsessions
   * https://docs.microsoft.com/en-us/graph/api/user-invalidateallrefreshtokens
   */
  async revokeAuth() {
    // await this._init();
    // await this._postJson("/me/revokeSignInSessions", {});
    throw new Error("Method not implemented.");
  }

  async getRevokeAddr() {
    return "https://account.live.com/consent/Manage";
  }
}
