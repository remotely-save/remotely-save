import {
  BoxOAuth,
  OAuthConfig,
} from "box-typescript-sdk-gen/lib/box/oauth.generated";
import * as mime from "mime-types";
import { DEFAULT_CONTENT_TYPE, type Entity } from "../../src/baseTypes";
import { FakeFs } from "../../src/fsAll";
import {
  BOX_CLIENT_ID,
  BOX_CLIENT_SECRET,
  type BoxConfig,
  COMMAND_CALLBACK_BOX,
} from "./baseTypesPro";

import { BoxDeveloperTokenAuth } from "box-typescript-sdk-gen/lib/box/developerTokenAuth.generated";
import { BoxClient } from "box-typescript-sdk-gen/lib/client.generated";
import type { FileFull } from "box-typescript-sdk-gen/lib/schemas/fileFull.generated";
import type { FileFullOrFolderMiniOrWebLink } from "box-typescript-sdk-gen/lib/schemas/fileFullOrFolderMiniOrWebLink.generated";
import type { FolderFull } from "box-typescript-sdk-gen/lib/schemas/folderFull.generated";
import type { Items } from "box-typescript-sdk-gen/lib/schemas/items.generated";
import PQueue from "p-queue";
import {
  delay,
  getFolderLevels,
  getSha1,
  splitFileSizeToChunkRanges,
  unixTimeToStr,
} from "../../src/misc";

export const DEFAULT_BOX_CONFIG: BoxConfig = {
  accessToken: "",
  refreshToken: "",
  accessTokenExpiresInMs: 0,
  accessTokenExpiresAtTimeMs: 0,
  credentialsShouldBeDeletedAtTimeMs: 0, // 60 days https://developer.box.com/guides/authentication/tokens/refresh/
  kind: "box",
};

export const generateAuthUrl = () => {
  const config = new OAuthConfig({
    clientId: BOX_CLIENT_ID ?? "",
    clientSecret: BOX_CLIENT_SECRET ?? "",
  });
  const oauth = new BoxOAuth({ config: config });

  // the URL to redirect the user to
  const authorize_url = oauth.getAuthorizeUrl({
    redirectUri: `obsidian://${COMMAND_CALLBACK_BOX}`,
  });
  // console.debug(authorize_url)
  return authorize_url;
};

/**
 * https://developer.box.com/guides/authentication/oauth2/without-sdk/
 */
export const sendAuthReq = async (authCode: string, errorCallBack: any) => {
  try {
    const k = {
      code: authCode,
      grant_type: "authorization_code",
      client_id: BOX_CLIENT_ID ?? "",
      client_secret: BOX_CLIENT_SECRET ?? "",
      // redirect_uri: `obsidian://${COMMAND_CALLBACK_BOX}`,
    };
    // console.debug(k);
    const resp1 = await fetch(`https://api.box.com/oauth2/token`, {
      method: "POST",
      body: new URLSearchParams(k),
    });
    const resp2 = await resp1.json();
    return resp2;
  } catch (e) {
    console.error(e);
    if (errorCallBack !== undefined) {
      await errorCallBack(e);
    }
  }
};

/**
 * https://developer.box.com/guides/authentication/tokens/refresh/
 */
export const sendRefreshTokenReq = async (refreshToken: string) => {
  console.debug(`refreshing token`);
  const x = await fetch("https://api.box.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: BOX_CLIENT_ID ?? "",
      client_secret: BOX_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (x.status === 200) {
    const y = await x.json();
    console.debug(`new token obtained`);
    return y;
  } else {
    throw Error(`cannot refresh an access token`);
  }
};

export const setConfigBySuccessfullAuthInplace = async (
  config: BoxConfig,
  authRes: any,
  saveUpdatedConfigFunc: () => Promise<any> | undefined
) => {
  if (authRes.access_token === undefined || authRes.access_token === "") {
    throw Error(
      `remotely save account auth failed, please auth again: ${JSON.stringify(authRes)}`
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

  console.info("finish updating local info of Box token");
};

interface CreateUploadSessionRawResponse {
  id: string;
  type: "upload_session";
  num_parts_processed: number;
  part_size: number;
  session_endpoints: {
    abort: string;
    commit: string;
    list_parts: string;
    log_event: string;
    status: string;
    upload_part: string;
  };
  session_expires_at: string;
  total_parts: number;
}

interface UploadChunkRawResponse {
  part: {
    offset: number;
    part_id: string;
    sha1: string;
    size: number;
  };
}

interface BoxEntity extends Entity {
  id: string;
  parentID: string | undefined;
  parentIDPath: string | undefined;
  isFolder: boolean;
  hashSha1: string | undefined;
}

const fromBoxItemToEntity = (
  boxItem: FileFullOrFolderMiniOrWebLink | FolderFull,
  parentID: string,
  parentFolderPath: string | undefined /* for bfs */
): BoxEntity => {
  if (parentID === undefined || parentID === "" || parentID === "0") {
    throw Error(`parentID=${parentID} should not be in fromBoxItemToEntity`);
  }

  let keyRaw = boxItem.name!;

  if (
    parentFolderPath !== undefined &&
    parentFolderPath !== "" &&
    parentFolderPath !== "/"
  ) {
    if (!parentFolderPath.endsWith("/")) {
      throw Error(
        `parentFolderPath=${parentFolderPath} should not be in fromFileToBoxEntity`
      );
    }
    keyRaw = `${parentFolderPath}${boxItem.name!}`;
  }

  if (boxItem.type === "folder") {
    keyRaw = `${keyRaw}/`;
    const mtime =
      (boxItem as FolderFull).contentModifiedAt?.value.valueOf() ??
      (boxItem as FolderFull).modifiedAt?.value.valueOf() ??
      Date.now();
    return {
      key: keyRaw,
      keyRaw: keyRaw,
      mtimeCli: mtime,
      mtimeSvr: mtime,
      id: boxItem.id,
      parentID: parentID,
      isFolder: true,
      size: 0,
      sizeRaw: 0,
      hash: undefined,
      hashSha1: undefined,
      parentIDPath: parentFolderPath,
    };
  } else if (boxItem.type === "file") {
    const mtime =
      boxItem.contentModifiedAt?.value.valueOf() ??
      boxItem.modifiedAt?.value.valueOf() ??
      Date.now();
    return {
      key: keyRaw,
      keyRaw: keyRaw,
      mtimeCli: mtime,
      mtimeSvr: mtime,
      id: boxItem.id,
      parentID: parentID,
      isFolder: false,
      size: boxItem.size!,
      sizeRaw: boxItem.size!,
      hash: boxItem.sha1,
      hashSha1: boxItem.sha1,
      parentIDPath: parentFolderPath,
    };
  } else {
    throw Error(`we do not support web link Box item`);
  }
};

const fromRawResponseToEntity = (
  boxItem: any,
  parentID: string,
  parentFolderPath: string | undefined /* for bfs */
): BoxEntity => {
  if (parentID === undefined || parentID === "" || parentID === "0") {
    throw Error(
      `parentID=${parentID} should not be in fromRawResponseToEntity`
    );
  }

  let keyRaw = boxItem.name!;

  if (
    parentFolderPath !== undefined &&
    parentFolderPath !== "" &&
    parentFolderPath !== "/"
  ) {
    if (!parentFolderPath.endsWith("/")) {
      throw Error(
        `parentFolderPath=${parentFolderPath} should not be in fromFileToBoxEntity`
      );
    }
    keyRaw = `${parentFolderPath}${boxItem.name!}`;
  }

  if (boxItem.type === "folder") {
    keyRaw = `${keyRaw}/`;
  } else if (boxItem.type === "file") {
    // pass
  } else {
    throw Error(`we do not support web link Box item`);
  }

  const mtimeStr = boxItem.content_modified_at ?? boxItem.modified_at;
  let mtime = Date.now();
  if (mtimeStr !== undefined) {
    mtime = new Date(mtimeStr).valueOf();
  }

  return {
    key: keyRaw,
    keyRaw: keyRaw,
    mtimeCli: mtime,
    mtimeSvr: mtime,
    id: boxItem.id,
    parentID: parentID,
    isFolder: false,
    size: boxItem.size ?? 0,
    sizeRaw: boxItem.size ?? 0,
    hash: boxItem.sha1 ?? undefined,
    hashSha1: boxItem.sha1 ?? undefined,
    parentIDPath: parentFolderPath,
  };
};

export class FakeFsBox extends FakeFs {
  kind: string;
  boxConfig: BoxConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;

  keyToBoxEntity: Record<string, BoxEntity>;

  baseDirID: string;

  constructor(
    boxConfig: BoxConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "box";
    this.boxConfig = boxConfig;
    this.remoteBaseDir = this.boxConfig.remoteBaseDir || vaultName || "";
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.keyToBoxEntity = {};
    this.baseDirID = "";
  }

  async _init() {
    const access = await this._getAccessToken();

    if (this.vaultFolderExists) {
      // pass
    } else {
      const auth = new BoxDeveloperTokenAuth({ token: access });
      const client = new BoxClient({ auth });

      // find
      let itemsInRoot: Items | undefined = undefined;

      let offset = 0;
      const limitPerPage = 1000; // max 1000

      while (!this.vaultFolderExists) {
        itemsInRoot = await client.folders.getFolderItems("0", {
          queryParams: {
            fields: [
              "id",
              "type",
              "name",
              "sha1",
              "size",
              "created_at",
              "modified_at",
              "expires_at",
              "parent",
              "content_created_at",
              "content_modified_at",
              "etag",
            ],
            offset: offset,
            limit: limitPerPage,
          },
        });
        // console.debug(`this.remoteBaseDir=${this.remoteBaseDir}`);
        // console.debug(`itemsInRoot:`);
        // console.debug(itemsInRoot);
        if (
          (itemsInRoot.entries?.filter((x) => x.name === this.remoteBaseDir)
            .length ?? 0) > 0
        ) {
          // we find it!
          const f = itemsInRoot.entries?.filter(
            (x) => x.name === this.remoteBaseDir
          )[0]!;
          this.baseDirID = f.id;
          this.vaultFolderExists = true;
          break;
        }

        if ((itemsInRoot.offset ?? 0) >= (itemsInRoot.totalCount ?? 0)) {
          break;
        }

        offset += limitPerPage;
      }

      if (!this.vaultFolderExists) {
        // create
        const f = await client.folders.createFolder({
          name: this.remoteBaseDir,
          parent: { id: "0" },
        });
        this.baseDirID = f.id;
        this.vaultFolderExists = true;
      }
    }
  }

  async _getAccessToken() {
    if (this.boxConfig.refreshToken === "") {
      throw Error("The user has not manually auth yet.");
    }

    const ts = Date.now();
    const comp = this.boxConfig.accessTokenExpiresAtTimeMs > ts;
    // console.debug(`this.boxConfig.accessTokenExpiresAtTimeMs=${this.boxConfig.accessTokenExpiresAtTimeMs},ts=${ts},comp=${comp}`)
    if (comp) {
      return this.boxConfig.accessToken;
    }

    // refresh
    const k = await sendRefreshTokenReq(this.boxConfig.refreshToken);
    this.boxConfig.accessToken = k.access_token;
    this.boxConfig.accessTokenExpiresInMs = k.expires_in * 1000;
    this.boxConfig.accessTokenExpiresAtTimeMs =
      ts + k.expires_in * 1000 - 60 * 2 * 1000;
    this.boxConfig.refreshToken =
      k.refresh_token || this.boxConfig.refreshToken;
    await this.saveUpdatedConfigFunc();
    console.info("Box accessToken updated");
    return this.boxConfig.accessToken;
  }

  async walk(): Promise<Entity[]> {
    await this._init();

    const allFiles: BoxEntity[] = [];

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

    let parents = [
      {
        id: this.baseDirID, // special init, from already created root folder ID
        folderPath: "",
      },
    ];

    while (parents.length !== 0) {
      // console.debug('enter while loop 1 of parents array');
      const children: typeof parents = [];
      for (const { id, folderPath } of parents) {
        queue.add(async () => {
          const filesUnderFolder = await this._walkFolder(id, folderPath);
          for (const f of filesUnderFolder) {
            allFiles.push(f);
            if (f.isFolder) {
              // keyRaw itself already has a tailing slash, no more slash here
              // keyRaw itself also already has full path
              const child = {
                id: f.id,
                folderPath: f.keyRaw,
              };
              // console.debug(
              //   `looping result of _walkFolder(${id},${folderPath}), adding child=${JSON.stringify(
              //     child
              //   )}`
              // );
              children.push(child);
            }
          }
        });
      }
      await queue.onIdle();
      parents = children;
    }

    // console.debug(`in the end of walk:`);
    // console.debug(allFiles);
    // console.debug(this.keyToBoxEntity);
    return allFiles;
  }

  async _walkFolder(
    parentID: string,
    parentFolderPath: string
  ): Promise<BoxEntity[]> {
    // console.debug(
    //   `input of single level: parentID=${parentID}, parentFolderPath=${parentFolderPath}`
    // );
    const filesOneLevel: BoxEntity[] = [];
    const access = await this._getAccessToken();
    const auth = new BoxDeveloperTokenAuth({ token: access });
    const client = new BoxClient({ auth });

    if (parentID === undefined || parentID === "" || parentID === "root") {
      // we should never start from root
      // because we encapsulate the vault inside a folder
      throw Error(`something goes wrong walking folder`);
    }

    let items: Items | undefined = undefined;

    let offset = 0;
    const limitPerPage = 1000; // max 1000
    do {
      // console.debug(`entering paging of parentID=${parentID}, offset=${offset}`);
      items = await client.folders.getFolderItems(parentID, {
        queryParams: {
          fields: [
            "id",
            "type",
            "name",
            "sha1",
            "size",
            "created_at",
            "modified_at",
            "expires_at",
            "parent",
            "content_created_at",
            "content_modified_at",
            "etag",
          ],
          offset: offset,
          limit: limitPerPage,
        },
      });
      // console.debug(`items of parentID=${parentID},offset=${offset}:`);
      // console.debug(items);

      for (const item of items.entries ?? []) {
        const entity = fromBoxItemToEntity(item, parentID, parentFolderPath);
        this.keyToBoxEntity[entity.keyRaw] = entity; // build cache
        filesOneLevel.push(entity);
      }

      offset += limitPerPage;
      // console.debug(`end of current loop parentID=${parentID}, and offset=${offset}`);
    } while (offset < (items?.totalCount ?? 0));

    return filesOneLevel;
  }

  async walkPartial(): Promise<Entity[]> {
    await this._init();
    const filesInLevel = await this._walkFolder(this.baseDirID, "");
    return filesInLevel;
  }

  async stat(key: string): Promise<Entity> {
    await this._init();

    // TODO: we already have a cache, should we call again?
    const cachedEntity = this.keyToBoxEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity === undefined || fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    const access = await this._getAccessToken();
    const auth = new BoxDeveloperTokenAuth({ token: access });
    const client = new BoxClient({ auth });

    let f: FileFull | FolderFull | undefined;
    if (cachedEntity.isFolder) {
      f = await client.folders.getFolderById(fileID);
    } else {
      f = await client.files.getFileById(fileID);
    }
    const entity = fromBoxItemToEntity(
      f,
      cachedEntity.parentID!,
      cachedEntity.parentIDPath!
    );
    // insert back to cache?? to update it??
    this.keyToBoxEntity[key] = entity;
    return entity;
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

    const cachedEntity = this.keyToBoxEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity !== undefined && fileID !== undefined) {
      return cachedEntity;
    }

    // xxx/ => ["xxx"]
    // xxx/yyy/zzz/ => ["xxx", "xxx/yyy", "xxx/yyy/zzz"]
    const folderLevels = getFolderLevels(key);
    let parentFolderPath: string | undefined = undefined;
    let parentID: string | undefined = undefined;
    if (folderLevels.length === 0) {
      throw Error(`cannot getFolderLevels of ${key}`);
    } else if (folderLevels.length === 1) {
      parentID = this.baseDirID;
      parentFolderPath = ""; // ignore base dir
    } else {
      // length > 1
      parentFolderPath = `${folderLevels[folderLevels.length - 2]}/`;
      if (!(parentFolderPath in this.keyToBoxEntity)) {
        throw Error(
          `parent of ${key}: ${parentFolderPath} is not created before??`
        );
      }
      parentID = this.keyToBoxEntity[parentFolderPath].id;
    }

    // xxx/yyy/zzz/ => ["xxx", "xxx/yyy", "xxx/yyy/zzz"] => "xxx/yyy/zzz" => "zzz"
    let folderItselfWithoutSlash = folderLevels[folderLevels.length - 1];
    folderItselfWithoutSlash = folderItselfWithoutSlash.split("/").pop()!;

    const access = await this._getAccessToken();
    const auth = new BoxDeveloperTokenAuth({ token: access });
    const client = new BoxClient({ auth });
    const f = await client.folders.createFolder({
      name: folderItselfWithoutSlash,
      parent: { id: parentID },
    });

    const entity = fromBoxItemToEntity(f, parentID, parentFolderPath);
    // insert into cache
    this.keyToBoxEntity[key] = entity;
    return entity;
  }

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

    const prevCachedEntity: BoxEntity | undefined = this.keyToBoxEntity[key];
    const prevFileID: string | undefined = prevCachedEntity?.id;

    const contentType =
      mime.contentType(mime.lookup(key) || DEFAULT_CONTENT_TYPE) ||
      DEFAULT_CONTENT_TYPE;

    let parentID: string | undefined = undefined;
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
      if (!(parentFolderPath in this.keyToBoxEntity)) {
        throw Error(
          `parent of ${key}: ${parentFolderPath} is not created before??`
        );
      }
      parentID = this.keyToBoxEntity[parentFolderPath].id;
    }

    const fileItself = key.split("/").pop()!;

    const BIG_FILE_THRESHOLD = 20000000; // box api hard coded...
    if (content.byteLength <= BIG_FILE_THRESHOLD) {
      const formData = new FormData();
      const attributes = {
        name: fileItself,
        parent: { id: parentID },
        content_created_at: unixTimeToStr(ctime),
        content_modified_at: unixTimeToStr(mtime),
      };
      formData.append("attributes", JSON.stringify(attributes));
      formData.append("file", new Blob([content], { type: contentType }));

      let url = "";
      if (prevFileID === undefined) {
        // create new file
        // https://developer.box.com/reference/post-files-content/
        url = `https://upload.box.com/api/2.0/files/content`;
      } else {
        // update new file
        // https://developer.box.com/reference/post-files-id-content/
        url = `https://upload.box.com/api/2.0/files/${prevFileID}/content`;
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
        },
        body: formData,
      });

      if (res.status !== 200 && res.status !== 201) {
        throw Error(
          `create file ${key} failed! attributes=${JSON.stringify(attributes)}`
        );
      }

      const res2 = await res.json();
      if (res2.entries === undefined) {
        throw Error(`upload small file ${key} failed!`);
      }
      const entity = fromRawResponseToEntity(
        res2.entries[0],
        parentID,
        parentFolderPath
      );
      this.keyToBoxEntity[key] = entity;
      // console.debug(`entity after upload=${JSON.stringify(entity, null, 2)}`);
      return entity;
    } else {
      // create session

      let url = "";
      if (prevFileID === undefined) {
        // https://developer.box.com/reference/post-files-upload-sessions/
        url = "https://upload.box.com/api/2.0/files/upload_sessions";
      } else {
        // https://developer.box.com/reference/post-files-id-upload-sessions/
        url = `https://upload.box.com/api/2.0/files/${prevFileID}/upload_sessions`;
      }

      const sessionRes1 = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          file_name: fileItself,
          file_size: content.byteLength,
          folder_id: parentID,
        }),
      });
      if (sessionRes1.status !== 200 && sessionRes1.status !== 201) {
        throw Error(
          `Create upload session for ${key} failed! Response header=${JSON.stringify(
            sessionRes1.headers
          )}`
        );
      }
      const sessionRes2: CreateUploadSessionRawResponse =
        await sessionRes1.json();
      // console.debug(sessionRes2);

      // upload by chunks
      const sizePerChunk = sessionRes2.part_size;
      const chunkRanges = splitFileSizeToChunkRanges(
        content.byteLength,
        sizePerChunk
      );
      // TODO: parallel
      const partsResult: UploadChunkRawResponse[] = [];
      for (const { start, end } of chunkRanges) {
        const subContent = content.slice(start, end + 1);
        const sha1 = await getSha1(subContent, "base64");
        const res = await fetch(sessionRes2.session_endpoints.upload_part, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${await this._getAccessToken()}`,
            // "Content-Length": `${end - start + 1}`, // the number of bytes in the current chunk
            "Content-Range": `bytes ${start}-${end}/${content.byteLength}`,
            "Content-Type": "application/octet-stream",
            digest: `sha=${sha1}`,
          },
          body: subContent,
        });
        if (res.status !== 200 && res.status !== 201) {
          throw Error(
            `Upload chunk for ${key}, ${start}-${end} failed! Response header=${JSON.stringify(
              res.headers
            )}`
          );
        }

        partsResult.push((await res.json()) as UploadChunkRawResponse);
      }
      // commit?
      const sha1 = await getSha1(content, "base64");
      let status = 202;
      let tries = 0;
      do {
        // console.debug(`begin commit key=${key} for tries=${tries}`)
        const commitRes1 = await fetch(sessionRes2.session_endpoints.commit, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this._getAccessToken()}`,

            "Content-Type": "application/json",
            digest: `sha=${sha1}`,
          },
          body: JSON.stringify({
            parts: partsResult.map((p) => p.part),
            attributes: {
              content_modified_at: unixTimeToStr(mtime, false),
              content_created_at: unixTimeToStr(ctime, false),
            },
          }),
        });
        status = commitRes1.status;
        // console.debug(`status===${status} for tries=${tries},key=${key}`)
        if (status === 200 || status === 201) {
          const commitRes2 = await commitRes1.json();
          if (commitRes2.entries === undefined) {
            throw Error(`Upload big file ${key} failed!`);
          }
          const entity = fromRawResponseToEntity(
            commitRes2.entries[0],
            parentID,
            parentFolderPath
          );
          this.keyToBoxEntity[key] = entity;
          // console.debug(
          //   `entity after upload=${JSON.stringify(entity, null, 2)}`
          // );
          return entity;
        } else if (status === 202) {
          await delay(500);
          tries += 1;
        } else {
          throw Error(
            `Commit all chunks for ${key} failed! Response header=${JSON.stringify(
              commitRes1.headers
            )}`
          );
        }
        // console.debug(`end commit key=${key}, currently status===${status}, tries===${tries} for next loop`)
      } while (status === 202 && tries < 4);
      throw Error(`Commit all chunks for ${key} failed! No idea what happened`);
    }
  }

  async readFile(key: string): Promise<ArrayBuffer> {
    await this._init();

    const cachedEntity = this.keyToBoxEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity === undefined || fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    const res1 = await fetch(
      `https://api.box.com/2.0/files/${fileID}/content`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
        },
      }
    );
    if (res1.status !== 200) {
      throw Error(
        `Cannot download file ${key} with id ${fileID}. Response header=${JSON.stringify(
          res1.headers
        )}`
      );
    }
    const res2 = await res1.arrayBuffer();
    return res2;
  }

  async rename(key1: string, key2: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async rm(key: string): Promise<void> {
    await this._init();

    const cachedEntity = this.keyToBoxEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity === undefined || fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    const access = await this._getAccessToken();
    const auth = new BoxDeveloperTokenAuth({ token: access });
    const client = new BoxClient({ auth });

    if (cachedEntity.isFolder) {
      await client.folders.deleteFolderById(fileID, {
        queryParams: { recursive: true },
      });
    } else {
      await client.files.deleteFileById(fileID);
    }
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
    throw new Error("Method not implemented.");
  }

  /**
   * https://developer.box.com/guides/authentication/tokens/revoke/
   */
  async revokeAuth(): Promise<any> {
    await fetch(`https://api.box.com/oauth2/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: BOX_CLIENT_ID ?? "",
        client_secret: BOX_CLIENT_SECRET ?? "",
        token: this.boxConfig.refreshToken,
      }).toString(),
    });
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
