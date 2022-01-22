import { CryptoProvider, PublicClientApplication } from "@azure/msal-node";
import {
  AuthenticationProvider,
  Client,
  FileUpload,
  LargeFileUploadSession,
  LargeFileUploadTask,
  LargeFileUploadTaskOptions,
  Range,
  UploadEventHandlers,
  UploadResult,
} from "@microsoft/microsoft-graph-client";
import type { DriveItem, User } from "@microsoft/microsoft-graph-types";
import cloneDeep from "lodash/cloneDeep";
import { request, Vault } from "obsidian";
import * as path from "path";
import {
  DropboxConfig,
  OAUTH2_FORCE_EXPIRE_MILLISECONDS,
  OnedriveConfig,
  RemoteItem,
} from "./baseTypes";
import { COMMAND_CALLBACK_ONEDRIVE } from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import {
  getRandomArrayBuffer,
  getRandomIntInclusive,
  mkdirpInVault,
} from "./misc";

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

const SCOPES = ["User.Read", "Files.ReadWrite.AppFolder", "offline_access"];
const REDIRECT_URI = `obsidian://${COMMAND_CALLBACK_ONEDRIVE}`;

export const DEFAULT_ONEDRIVE_CONFIG: OnedriveConfig = {
  accessToken: "",
  clientID: process.env.DEFAULT_ONEDRIVE_CLIENT_ID,
  authority: process.env.DEFAULT_ONEDRIVE_AUTHORITY,
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
  verifier: string
) => {
  // // original code snippets for references
  // const authResponse = await pca.acquireTokenByCode({
  //   redirectUri: REDIRECT_URI,
  //   scopes: SCOPES,
  //   code: authCode,
  //   codeVerifier: verifier, // PKCE Code Verifier
  // });
  // log.info('authResponse')
  // log.info(authResponse)
  // return authResponse;

  // Because of the CORS problem,
  // we need to construct raw request using Obsidian request,
  // instead of using msal
  // https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow
  // https://docs.microsoft.com/en-us/onedrive/developer/rest-api/getting-started/graph-oauth?view=odsp-graph-online#code-flow
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
  // log.info(rsp2);

  if (rsp2.error !== undefined) {
    return rsp2 as AccessCodeResponseFailedType;
  } else {
    return rsp2 as AccessCodeResponseSuccessfulType;
  }
};

export const sendRefreshTokenReq = async (
  clientID: string,
  authority: string,
  refreshToken: string
) => {
  // also use Obsidian request to bypass CORS issue.
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
  // log.info(rsp2);

  if (rsp2.error !== undefined) {
    return rsp2 as AccessCodeResponseFailedType;
  } else {
    return rsp2 as AccessCodeResponseSuccessfulType;
  }
};

export const setConfigBySuccessfullAuthInplace = async (
  config: OnedriveConfig,
  authRes: AccessCodeResponseSuccessfulType,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  log.info("start updating local info of OneDrive token");
  config.accessToken = authRes.access_token;
  config.accessTokenExpiresAtTime =
    Date.now() + authRes.expires_in - 5 * 60 * 1000;
  config.accessTokenExpiresInSeconds = authRes.expires_in;
  config.refreshToken = authRes.refresh_token;

  // manually set it expired after 80 days;
  config.credentialsShouldBeDeletedAtTime =
    Date.now() + OAUTH2_FORCE_EXPIRE_MILLISECONDS;

  if (saveUpdatedConfigFunc !== undefined) {
    await saveUpdatedConfigFunc();
  }

  log.info("finish updating local info of Onedrive token");
};

////////////////////////////////////////////////////////////////////////////////
// Other usual common methods
////////////////////////////////////////////////////////////////////////////////

const getOnedrivePath = (fileOrFolderPath: string, vaultName: string) => {
  // https://docs.microsoft.com/en-us/onedrive/developer/rest-api/concepts/special-folders-appfolder?view=odsp-graph-online
  const prefix = `/drive/special/approot:/${vaultName}`;
  if (fileOrFolderPath.startsWith(prefix)) {
    // already transformed, return as is
    return fileOrFolderPath;
  }

  let key = fileOrFolderPath;
  if (fileOrFolderPath === "/" || fileOrFolderPath === "") {
    // special
    return prefix;
  }
  if (key.endsWith("/")) {
    key = key.slice(0, key.length - 1);
  }

  key = `${prefix}/${key}`;
  return key;
};

const getNormPath = (fileOrFolderPath: string, vaultName: string) => {
  const prefix = `/drive/special/approot:/${vaultName}`;

  if (
    !(fileOrFolderPath === prefix || fileOrFolderPath.startsWith(`${prefix}/`))
  ) {
    throw Error(
      `"${fileOrFolderPath}" doesn't starts with "${prefix}/" or equals to "${prefix}"`
    );
  }

  if (fileOrFolderPath === prefix) {
    return "/";
  }
  return fileOrFolderPath.slice(`${prefix}/`.length);
};

const constructFromDriveItemToRemoteItemError = (x: DriveItem) => {
  return `parentPath="${x.parentReference.path}", selfName="${x.name}"`;
};

const fromDriveItemToRemoteItem = (
  x: DriveItem,
  vaultName: string
): RemoteItem => {
  let key = "";

  // possible prefix:
  // pure english: /drive/root:/Apps/remotely-save/${vaultName}
  // or localized, e.g.: /drive/root:/应用/remotely-save/${vaultName}
  const FIRST_COMMON_PREFIX_REGEX = /^\/drive\/root:\/[^\/]+\/remotely-save\//g;
  // or the root is absolute path /Livefolders,
  // e.g.: /Livefolders/应用/remotely-save/${vaultName}
  const SECOND_COMMON_PREFIX_REGEX = /^\/Livefolders\/[^\/]+\/remotely-save\//g;

  // another possibile prefix
  const THIRD_COMMON_PREFIX_RAW = `/drive/items/`;

  const fullPathOriginal = `${x.parentReference.path}/${x.name}`;
  const matchFirstPrefixRes = fullPathOriginal.match(FIRST_COMMON_PREFIX_REGEX);
  const matchSecondPrefixRes = fullPathOriginal.match(
    SECOND_COMMON_PREFIX_REGEX
  );
  if (
    matchFirstPrefixRes !== null &&
    fullPathOriginal.startsWith(`${matchFirstPrefixRes[0]}${vaultName}`)
  ) {
    const foundPrefix = `${matchFirstPrefixRes[0]}${vaultName}`;
    key = fullPathOriginal.substring(foundPrefix.length + 1);
  } else if (
    matchSecondPrefixRes !== null &&
    fullPathOriginal.startsWith(`${matchSecondPrefixRes[0]}${vaultName}`)
  ) {
    const foundPrefix = `${matchSecondPrefixRes[0]}${vaultName}`;
    key = fullPathOriginal.substring(foundPrefix.length + 1);
  } else if (x.parentReference.path.startsWith(THIRD_COMMON_PREFIX_RAW)) {
    // it's something like
    // /drive/items/<some_id>!<another_id>:/${vaultName}/<subfolder>
    // with uri encoded!
    const parPath = decodeURIComponent(x.parentReference.path);
    key = parPath.substring(parPath.indexOf(":") + 1);
    if (key.startsWith(`/${vaultName}/`)) {
      key = key.substring(`/${vaultName}/`.length);
      key = `${key}/${x.name}`;
    } else if (key === `/${vaultName}`) {
      key = x.name;
    } else {
      throw Error(
        `we meet file/folder and do not know how to deal with it:\n${constructFromDriveItemToRemoteItemError(
          x
        )}`
      );
    }
  } else {
    throw Error(
      `we meet file/folder and do not know how to deal with it:\n${constructFromDriveItemToRemoteItemError(
        x
      )}`
    );
  }

  const isFolder = "folder" in x;
  if (isFolder) {
    key = `${key}/`;
  }
  return {
    key: key,
    lastModified: Date.parse(x.fileSystemInfo.lastModifiedDateTime),
    size: isFolder ? 0 : x.size,
    remoteType: "onedrive",
    etag: x.eTag || x.cTag || "",
  };
};

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
  getAccessToken = async () => {
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
      this.onedriveConfig.refreshToken = r2.refresh_token;
      this.onedriveConfig.accessTokenExpiresInSeconds = r2.expires_in;
      this.onedriveConfig.accessTokenExpiresAtTime =
        currentTs + r2.expires_in * 1000 - 60 * 2 * 1000;
      await this.saveUpdatedConfigFunc();
      log.info("Onedrive accessToken updated");
      return this.onedriveConfig.accessToken;
    }
  };
}

export class WrappedOnedriveClient {
  onedriveConfig: OnedriveConfig;
  vaultName: string;
  client: Client;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;
  constructor(
    onedriveConfig: OnedriveConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    this.onedriveConfig = onedriveConfig;
    this.vaultName = vaultName;
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.client = Client.initWithMiddleware({
      authProvider: new MyAuthProvider(onedriveConfig, saveUpdatedConfigFunc),
    });
  }

  init = async () => {
    // check token
    if (
      this.onedriveConfig.accessToken === "" ||
      this.onedriveConfig.refreshToken === ""
    ) {
      throw Error("The user has not manually auth yet.");
    }

    // check vault folder
    // log.info(`checking remote has folder /${this.vaultName}`);
    if (this.vaultFolderExists) {
      // log.info(`already checked, /${this.vaultName} exist before`)
    } else {
      const k = await this.client.api("/drive/special/approot/children").get();
      // log.info(k);
      this.vaultFolderExists =
        (k.value as DriveItem[]).filter((x) => x.name === this.vaultName)
          .length > 0;
      if (!this.vaultFolderExists) {
        log.info(`remote does not have folder /${this.vaultName}`);
        await this.client.api("/drive/special/approot/children").post({
          name: `${this.vaultName}`,
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        });
        log.info(`remote folder /${this.vaultName} created`);
        this.vaultFolderExists = true;
      } else {
        // log.info(`remote folder /${this.vaultName} exists`);
      }
    }
  };
}

export const getOnedriveClient = (
  onedriveConfig: OnedriveConfig,
  vaultName: string,
  saveUpdatedConfigFunc: () => Promise<any>
) => {
  return new WrappedOnedriveClient(
    onedriveConfig,
    vaultName,
    saveUpdatedConfigFunc
  );
};

/**
 * Use delta api to list all files and folders
 * https://docs.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_delta?view=odsp-graph-online
 * @param client
 * @param prefix
 */
export const listFromRemote = async (
  client: WrappedOnedriveClient,
  prefix?: string
) => {
  if (prefix !== undefined) {
    throw Error("prefix not supported (yet)");
  }
  await client.init();

  const NEXT_LINK_KEY = "@odata.nextLink";
  const DELTA_LINK_KEY = "@odata.deltaLink";
  let res = await client.client
    .api(`/drive/special/approot:/${client.vaultName}:/delta`)
    .get();
  let driveItems = res.value as DriveItem[];

  while (NEXT_LINK_KEY in res) {
    res = await client.client.api(res[NEXT_LINK_KEY]).get();
    driveItems.push(...cloneDeep(res.value as DriveItem[]));
  }

  // lastly we should have delta link?
  if (DELTA_LINK_KEY in res) {
    client.onedriveConfig.deltaLink = res[DELTA_LINK_KEY];
    await client.saveUpdatedConfigFunc();
  }

  driveItems = driveItems.map((x) => {
    const y = cloneDeep(x);
    y.parentReference.path = y.parentReference.path.replace("/Apps", "/应用");
    return y;
  });

  // unify everything to RemoteItem
  const unifiedContents = driveItems
    .map((x) => fromDriveItemToRemoteItem(x, client.vaultName))
    .filter((x) => x.key !== "/");
  return {
    Contents: unifiedContents,
  };
};

export const getRemoteMeta = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string
) => {
  await client.init();
  const remotePath = getOnedrivePath(fileOrFolderPath, client.vaultName);
  // log.info(`remotePath=${remotePath}`);
  const rsp = await client.client
    .api(remotePath)
    .select("cTag,eTag,fileSystemInfo,folder,file,name,parentReference,size")
    .get();
  // log.info(rsp);
  const driveItem = rsp as DriveItem;
  const res = fromDriveItemToRemoteItem(driveItem, client.vaultName);
  // log.info(res);
  return res;
};

export const uploadToRemote = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string,
  vault: Vault,
  isRecursively: boolean = false,
  password: string = "",
  remoteEncryptedKey: string = "",
  foldersCreatedBefore: Set<string> | undefined = undefined
) => {
  await client.init();

  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    uploadFile = remoteEncryptedKey;
  }
  uploadFile = getOnedrivePath(uploadFile, client.vaultName);
  // log.info(`uploadFile=${uploadFile}`);

  const isFolder = fileOrFolderPath.endsWith("/");

  if (isFolder && isRecursively) {
    throw Error("upload function doesn't implement recursive function yet!");
  } else if (isFolder && !isRecursively) {
    // folder
    if (password === "") {
      // if not encrypted, mkdir a remote folder
      if (foldersCreatedBefore?.has(uploadFile)) {
        // created, pass
      } else {
        // https://stackoverflow.com/questions/56479865/creating-nested-folders-in-one-go-onedrive-api
        // use PATCH to create folder recursively!!!
        await client.client.api(uploadFile).patch({
          folder: {},
          "@microsoft.graph.conflictBehavior": "replace",
        });
      }
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    } else {
      // if encrypted,
      // upload a fake, random-size file
      // with the encrypted file name
      const byteLengthRandom = getRandomIntInclusive(
        1,
        65536 /* max allowed */
      );
      const arrBufRandom = await encryptArrayBuffer(
        getRandomArrayBuffer(byteLengthRandom),
        password
      );

      const uploadSession: LargeFileUploadSession =
        await LargeFileUploadTask.createUploadSession(
          client.client,
          `https://graph.microsoft.com/v1.0/me${encodeURIComponent(
            uploadFile
          )}:/createUploadSession`,
          {
            item: {
              "@microsoft.graph.conflictBehavior": "replace",
            },
          }
        );
      const task = new LargeFileUploadTask(
        client.client,
        new FileUpload(
          arrBufRandom,
          path.posix.basename(uploadFile),
          arrBufRandom.byteLength
        ),
        uploadSession,
        {
          rangeSize: 1024 * 1024,
          uploadEventHandlers: {
            progress: (range?: Range) => {
              // Handle progress event
              // log.info(
              //   `uploading ${range.minValue}-${range.maxValue} of ${fileOrFolderPath}`
              // );
            },
          } as UploadEventHandlers,
        } as LargeFileUploadTaskOptions
      );
      const uploadResult: UploadResult = await task.upload();
      // log.info(uploadResult)
      const res = await getRemoteMeta(client, uploadFile);
      return res;
    }
  } else {
    // file
    // we ignore isRecursively parameter here
    const localContent = await vault.adapter.readBinary(fileOrFolderPath);
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }

    // no need to create parent folders firstly, cool!

    // we need to customize the special root folder,
    // so use LargeFileUploadTask instead of OneDriveLargeFileUploadTask
    const progress = (range?: Range) => {
      // Handle progress event
      // log.info(
      //   `uploading ${range.minValue}-${range.maxValue} of ${fileOrFolderPath}`
      // );
    };
    const uploadEventHandlers: UploadEventHandlers = {
      progress: progress,
    };
    const options: LargeFileUploadTaskOptions = {
      rangeSize: 1024 * 1024,
      uploadEventHandlers: uploadEventHandlers,
    };
    const payload = {
      item: {
        "@microsoft.graph.conflictBehavior": "replace",
      },
    };
    // uploadFile already starts with /drive/special/approot:/${vaultName}
    const uploadSession: LargeFileUploadSession =
      await LargeFileUploadTask.createUploadSession(
        client.client,
        `https://graph.microsoft.com/v1.0/me${encodeURIComponent(
          uploadFile
        )}:/createUploadSession`,
        payload
      );
    const fileObject = new FileUpload(
      remoteContent,
      path.posix.basename(uploadFile),
      remoteContent.byteLength
    );
    const task = new LargeFileUploadTask(
      client.client,
      fileObject,
      uploadSession,
      options
    );
    const uploadResult: UploadResult = await task.upload();
    // log.info(uploadResult)
    const res = await getRemoteMeta(client, uploadFile);
    return res;
  }
};

const downloadFromRemoteRaw = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string
): Promise<ArrayBuffer> => {
  await client.init();
  const key = getOnedrivePath(fileOrFolderPath, client.vaultName);
  const rsp = await client.client
    .api(key)
    .select("@microsoft.graph.downloadUrl")
    .get();
  const downloadUrl: string = rsp["@microsoft.graph.downloadUrl"];
  const content = await (await fetch(downloadUrl)).arrayBuffer();
  return content;
};

export const downloadFromRemote = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string,
  vault: Vault,
  mtime: number,
  password: string = "",
  remoteEncryptedKey: string = ""
) => {
  await client.init();

  const isFolder = fileOrFolderPath.endsWith("/");

  await mkdirpInVault(fileOrFolderPath, vault);

  if (isFolder) {
    // mkdirp locally is enough
    // do nothing here
  } else {
    let downloadFile = fileOrFolderPath;
    if (password !== "") {
      downloadFile = remoteEncryptedKey;
    }
    downloadFile = getOnedrivePath(downloadFile, client.vaultName);
    const remoteContent = await downloadFromRemoteRaw(client, downloadFile);
    let localContent = remoteContent;
    if (password !== "") {
      localContent = await decryptArrayBuffer(remoteContent, password);
    }
    await vault.adapter.writeBinary(fileOrFolderPath, localContent, {
      mtime: mtime,
    });
  }
};

export const deleteFromRemote = async (
  client: WrappedOnedriveClient,
  fileOrFolderPath: string,
  password: string = "",
  remoteEncryptedKey: string = ""
) => {
  if (fileOrFolderPath === "/") {
    return;
  }
  let remoteFileName = fileOrFolderPath;
  if (password !== "") {
    remoteFileName = remoteEncryptedKey;
  }
  remoteFileName = getOnedrivePath(remoteFileName, client.vaultName);

  await client.init();
  await client.client.api(remoteFileName).delete();
};

export const checkConnectivity = async (client: WrappedOnedriveClient) => {
  try {
    const k = await getUserDisplayName(client);
    return k !== "<unknown display name>";
  } catch (err) {
    return false;
  }
};

export const getUserDisplayName = async (client: WrappedOnedriveClient) => {
  await client.init();
  const res: User = await client.client.api("/me").select("displayName").get();
  return res.displayName || "<unknown display name>";
};

/**
 *
 * https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-protocols-oidc#send-a-sign-out-request
 * https://docs.microsoft.com/en-us/graph/api/user-revokesigninsessions
 * https://docs.microsoft.com/en-us/graph/api/user-invalidateallrefreshtokens
 * @param client
 */
// export const revokeAuth = async (client: WrappedOnedriveClient) => {
//   await client.init();
//   await client.client.api('/me/revokeSignInSessions').post(undefined);
// };

export const getRevokeAddr = async () => {
  return "https://account.live.com/consent/Manage";
};
