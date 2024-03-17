import { rangeDelay } from "delay";
import { Dropbox, DropboxAuth } from "dropbox";
import type { files, DropboxResponseError, DropboxResponse } from "dropbox";
import { Vault } from "obsidian";
import * as path from "path";
import {
  DropboxConfig,
  Entity,
  COMMAND_CALLBACK_DROPBOX,
  OAUTH2_FORCE_EXPIRE_MILLISECONDS,
  UploadedType,
} from "./baseTypes";
import { decryptArrayBuffer, encryptArrayBuffer } from "./encrypt";
import {
  bufferToArrayBuffer,
  getFolderLevels,
  hasEmojiInText,
  headersToRecord,
  mkdirpInVault,
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

export const getDropboxPath = (
  fileOrFolderPath: string,
  remoteBaseDir: string
) => {
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
      keyRaw: key,
      sizeRaw: 0,
      etag: `${x.id}\t`,
    } as Entity;
  } else if (x[".tag"] === "file") {
    const mtimeCli = Date.parse(x.client_modified).valueOf();
    const mtimeSvr = Date.parse(x.server_modified).valueOf();
    return {
      keyRaw: key,
      mtimeCli: mtimeCli,
      mtimeSvr: mtimeSvr,
      sizeRaw: x.size,
      hash: x.content_hash,
      etag: `${x.id}\t${x.content_hash}`,
    } as Entity;
  } else {
    // x[".tag"] === "deleted"
    throw Error("do not support deleted tag");
  }
};

////////////////////////////////////////////////////////////////////////////////
// Dropbox authorization using PKCE
// see https://dropbox.tech/developers/pkce--what-and-why-
////////////////////////////////////////////////////////////////////////////////

export const getAuthUrlAndVerifier = async (
  appKey: string,
  needManualPatse: boolean = false
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
  config.accessTokenExpiresInSeconds = parseInt(authRes.expires_in);
  config.accessTokenExpiresAtTime =
    Date.now() + parseInt(authRes.expires_in) * 1000 - 10 * 1000;

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
// Other usual common methods
////////////////////////////////////////////////////////////////////////////////

interface ErrSubType {
  error: {
    retry_after: number;
  };
}

async function retryReq<T>(
  reqFunc: () => Promise<DropboxResponse<T>>,
  extraHint: string = ""
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
        parseInt(headers["retry-after"] || "1") ||
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
      await rangeDelay(secMin * 1000, secMax * 1000);
    }
  }
}

export class WrappedDropboxClient {
  dropboxConfig: DropboxConfig;
  remoteBaseDir: string;
  saveUpdatedConfigFunc: () => Promise<any>;
  dropbox!: Dropbox;
  vaultFolderExists: boolean;
  constructor(
    dropboxConfig: DropboxConfig,
    remoteBaseDir: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    this.dropboxConfig = dropboxConfig;
    this.remoteBaseDir = remoteBaseDir;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.vaultFolderExists = false;
  }

  init = async () => {
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

    return this.dropbox;
  };
}

/**
 * @param dropboxConfig
 * @returns
 */
export const getDropboxClient = (
  dropboxConfig: DropboxConfig,
  remoteBaseDir: string,
  saveUpdatedConfigFunc: () => Promise<any>
) => {
  return new WrappedDropboxClient(
    dropboxConfig,
    remoteBaseDir,
    saveUpdatedConfigFunc
  );
};

export const getRemoteMeta = async (
  client: WrappedDropboxClient,
  remotePath: string
) => {
  await client.init();
  // if (remotePath === "" || remotePath === "/") {
  //   // filesGetMetadata doesn't support root folder
  //   // we instead try to list files
  //   // if no error occurs, we ensemble a fake result.
  //   const rsp = await retryReq(() =>
  //     client.dropbox.filesListFolder({
  //       path: `/${client.remoteBaseDir}`,
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
    client.dropbox.filesGetMetadata({
      path: remotePath,
    })
  );
  if (rsp === undefined) {
    throw Error("dropbox.filesGetMetadata undefinded");
  }
  if (rsp.status !== 200) {
    throw Error(JSON.stringify(rsp));
  }
  return fromDropboxItemToEntity(rsp.result, client.remoteBaseDir);
};

export const uploadToRemote = async (
  client: WrappedDropboxClient,
  fileOrFolderPath: string,
  vault: Vault | undefined,
  isRecursively: boolean = false,
  password: string = "",
  remoteEncryptedKey: string = "",
  foldersCreatedBefore: Set<string> | undefined = undefined,
  uploadRaw: boolean = false,
  rawContent: string | ArrayBuffer = "",
  rawContentMTime: number = 0,
  rawContentCTime: number = 0
): Promise<UploadedType> => {
  await client.init();

  let uploadFile = fileOrFolderPath;
  if (password !== "") {
    if (remoteEncryptedKey === undefined || remoteEncryptedKey === "") {
      throw Error(
        `uploadToRemote(dropbox) you have password but remoteEncryptedKey is empty!`
      );
    }
    uploadFile = remoteEncryptedKey;
  }
  uploadFile = getDropboxPath(uploadFile, client.remoteBaseDir);

  if (hasEmojiInText(uploadFile)) {
    throw new Error(
      `${uploadFile}: Error: Dropbox does not support emoji in file / folder names.`
    );
  }

  let mtime = 0;
  let ctime = 0;
  const s = await vault?.adapter?.stat(fileOrFolderPath);
  if (s !== undefined && s !== null) {
    mtime = Math.round(s.mtime / 1000.0) * 1000;
    ctime = Math.round(s.ctime / 1000.0) * 1000;
  }
  const mtimeStr = new Date(mtime).toISOString().replace(/\.\d{3}Z$/, "Z");

  const isFolder = fileOrFolderPath.endsWith("/");

  if (isFolder && isRecursively) {
    throw Error("upload function doesn't implement recursive function yet!");
  } else if (isFolder && !isRecursively) {
    if (uploadRaw) {
      throw Error(`you specify uploadRaw, but you also provide a folder key!`);
    }
    // folder
    if (password === "") {
      // if not encrypted, mkdir a remote folder
      if (foldersCreatedBefore?.has(uploadFile)) {
        // created, pass
      } else {
        try {
          await retryReq(
            () =>
              client.dropbox.filesCreateFolderV2({
                path: uploadFile,
              }),
            fileOrFolderPath
          );
          foldersCreatedBefore?.add(uploadFile);
        } catch (e: unknown) {
          const err = e as DropboxResponseError<files.CreateFolderError>;
          if (err.status === undefined) {
            throw err;
          }
          if (err.status === 409) {
            // pass
            foldersCreatedBefore?.add(uploadFile);
          } else {
            throw err;
          }
        }
      }
      const res = await getRemoteMeta(client, uploadFile);
      return {
        entity: res,
        mtimeCli: mtime,
      };
    } else {
      // if encrypted, upload a fake file with the encrypted file name
      await retryReq(
        () =>
          client.dropbox.filesUpload({
            path: uploadFile,
            contents: "",
            client_modified: mtimeStr,
          }),
        fileOrFolderPath
      );
      return {
        entity: await getRemoteMeta(client, uploadFile),
        mtimeCli: mtime,
      };
    }
  } else {
    // file
    // we ignore isRecursively parameter here
    let localContent = undefined;
    if (uploadRaw) {
      if (typeof rawContent === "string") {
        localContent = new TextEncoder().encode(rawContent).buffer;
      } else {
        localContent = rawContent;
      }
    } else {
      if (vault === undefined) {
        throw new Error(
          `the vault variable is not passed but we want to read ${fileOrFolderPath} for Dropbox`
        );
      }
      localContent = await vault.adapter.readBinary(fileOrFolderPath);
    }
    let remoteContent = localContent;
    if (password !== "") {
      remoteContent = await encryptArrayBuffer(localContent, password);
    }
    // in dropbox, we don't need to create folders before uploading! cool!
    // TODO: filesUploadSession for larger files (>=150 MB)

    await retryReq(
      () =>
        client.dropbox.filesUpload({
          path: uploadFile,
          contents: remoteContent,
          mode: {
            ".tag": "overwrite",
          },
          client_modified: mtimeStr,
        }),
      fileOrFolderPath
    );

    // we want to mark that parent folders are created
    if (foldersCreatedBefore !== undefined) {
      const dirs = getFolderLevels(uploadFile).map((x) =>
        getDropboxPath(x, client.remoteBaseDir)
      );
      for (const dir of dirs) {
        foldersCreatedBefore?.add(dir);
      }
    }
    return {
      entity: await getRemoteMeta(client, uploadFile),
      mtimeCli: mtime,
    };
  }
};

export const listAllFromRemote = async (client: WrappedDropboxClient) => {
  await client.init();
  let res = await client.dropbox.filesListFolder({
    path: `/${client.remoteBaseDir}`,
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
    .filter((x) => x.path_display !== `/${client.remoteBaseDir}`)
    .map((x) => fromDropboxItemToEntity(x, client.remoteBaseDir));

  while (res.result.has_more) {
    res = await client.dropbox.filesListFolderContinue({
      cursor: res.result.cursor,
    });
    if (res.status !== 200) {
      throw Error(JSON.stringify(res));
    }

    const contents2 = res.result.entries;
    const unifiedContents2 = contents2
      .filter((x) => x[".tag"] !== "deleted")
      .filter((x) => x.path_display !== `/${client.remoteBaseDir}`)
      .map((x) => fromDropboxItemToEntity(x, client.remoteBaseDir));
    unifiedContents.push(...unifiedContents2);
  }

  return unifiedContents;
};

const downloadFromRemoteRaw = async (
  client: WrappedDropboxClient,
  remotePath: string
) => {
  await client.init();
  const rsp = await retryReq(
    () =>
      client.dropbox.filesDownload({
        path: remotePath,
      }),
    `downloadFromRemoteRaw=${remotePath}`
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
};

export const downloadFromRemote = async (
  client: WrappedDropboxClient,
  fileOrFolderPath: string,
  vault: Vault,
  mtime: number,
  password: string = "",
  remoteEncryptedKey: string = "",
  skipSaving: boolean = false
) => {
  await client.init();

  const isFolder = fileOrFolderPath.endsWith("/");

  if (!skipSaving) {
    await mkdirpInVault(fileOrFolderPath, vault);
  }

  // the file is always local file
  // we need to encrypt it

  if (isFolder) {
    // mkdirp locally is enough
    // do nothing here
    return new ArrayBuffer(0);
  } else {
    let downloadFile = fileOrFolderPath;
    if (password !== "") {
      downloadFile = remoteEncryptedKey;
    }
    downloadFile = getDropboxPath(downloadFile, client.remoteBaseDir);
    const remoteContent = await downloadFromRemoteRaw(client, downloadFile);
    let localContent = remoteContent;
    if (password !== "") {
      localContent = await decryptArrayBuffer(remoteContent, password);
    }
    if (!skipSaving) {
      await vault.adapter.writeBinary(fileOrFolderPath, localContent, {
        mtime: mtime,
      });
    }
    return localContent;
  }
};

export const deleteFromRemote = async (
  client: WrappedDropboxClient,
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
  remoteFileName = getDropboxPath(remoteFileName, client.remoteBaseDir);

  await client.init();
  try {
    await retryReq(
      () =>
        client.dropbox.filesDeleteV2({
          path: remoteFileName,
        }),
      fileOrFolderPath
    );
  } catch (err) {
    console.error("some error while deleting");
    console.error(err);
  }
};

export const checkConnectivity = async (
  client: WrappedDropboxClient,
  callbackFunc?: any
) => {
  try {
    await client.init();
    const results = await getRemoteMeta(client, `/${client.remoteBaseDir}`);
    if (results === undefined) {
      return false;
    }
    return true;
  } catch (err) {
    console.debug(err);
    if (callbackFunc !== undefined) {
      callbackFunc(err);
    }
    return false;
  }
};

export const getUserDisplayName = async (client: WrappedDropboxClient) => {
  await client.init();
  const acct = await client.dropbox.usersGetCurrentAccount();
  return acct.result.name.display_name;
};

export const revokeAuth = async (client: WrappedDropboxClient) => {
  await client.init();
  await client.dropbox.authTokenRevoke();
};
