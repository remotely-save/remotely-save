// https://developers.google.com/identity/protocols/oauth2/native-app
// https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
// https://developers.google.com/identity/protocols/oauth2/web-server

import * as mime from "mime-types";
import { DEFAULT_CONTENT_TYPE, type Entity } from "../../src/baseTypes";
import { FakeFs } from "../../src/fsAll";
import {
  getFolderLevels,
  splitFileSizeToChunkRanges,
  unixTimeToStr,
} from "../../src/misc";
import {
  GOOGLEDRIVE_CLIENT_ID,
  GOOGLEDRIVE_CLIENT_SECRET,
  type GoogleDriveConfig,
} from "./baseTypesPro";

export const DEFAULT_GOOGLEDRIVE_CONFIG: GoogleDriveConfig = {
  accessToken: "",
  refreshToken: "",
  accessTokenExpiresInMs: 0,
  accessTokenExpiresAtTimeMs: 0,
  credentialsShouldBeDeletedAtTimeMs: 0,
  scope: "https://www.googleapis.com/auth/drive.file",
  kind: "googledrive",
};

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

/**
 * A simplified version of the type
 *
 */
interface File {
  kind?: string;
  driveId?: string;
  fileExtension?: string;
  copyRequiresWriterPermission?: boolean;
  md5Checksum?: string;
  writersCanShare?: boolean;
  viewedByMe?: boolean;
  mimeType?: string;
  parents?: string[];
  thumbnailLink?: string;
  iconLink?: string;
  shared?: boolean;
  headRevisionId?: string;
  webViewLink?: string;
  webContentLink?: string;
  size?: string;
  viewersCanCopyContent?: boolean;
  hasThumbnail?: boolean;
  spaces?: string[];
  folderColorRgb?: string;
  id?: string;
  name?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  explicitlyTrashed?: boolean;
  createdTime?: string;
  modifiedTime?: string;
  modifiedByMeTime?: string;
  viewedByMeTime?: string;
  sharedWithMeTime?: string;
  quotaBytesUsed?: string;
  version?: string;
  originalFilename?: string;
  ownedByMe?: boolean;
  fullFileExtension?: string;
  isAppAuthorized?: boolean;
  teamDriveId?: string;
  hasAugmentedPermissions?: boolean;
  thumbnailVersion?: string;
  trashedTime?: string;
  modifiedByMe?: boolean;
  permissionIds?: string[];
  resourceKey?: string;
  sha1Checksum?: string;
  sha256Checksum?: string;
}

interface GDEntity extends Entity {
  id: string;
  parentID: string | undefined;
  parentIDPath: string | undefined;
  isFolder: boolean;
}

/**
 * https://developers.google.com/identity/protocols/oauth2/web-server#httprest_7
 * @param refreshToken
 */
export const sendRefreshTokenReq = async (refreshToken: string) => {
  console.debug(`refreshing token`);
  const x = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: GOOGLEDRIVE_CLIENT_ID ?? "",
      client_secret: GOOGLEDRIVE_CLIENT_SECRET ?? "",
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

  // {
  //   "access_token": "1/fFAGRNJru1FTz70BzhT3Zg",
  //   "expires_in": 3920,
  //   "scope": "https://www.googleapis.com/auth/drive.file",
  //   "token_type": "Bearer"
  // }
};

const fromFileToGDEntity = (
  file: File,
  parentID: string,
  parentFolderPath: string | undefined /* for bfs */
) => {
  if (parentID === undefined || parentID === "" || parentID === "root") {
    throw Error(`parentID=${parentID} should not be in fromFileToGDEntity`);
  }

  let keyRaw = file.name!;
  if (
    parentFolderPath !== undefined &&
    parentFolderPath !== "" &&
    parentFolderPath !== "/"
  ) {
    if (!parentFolderPath.endsWith("/")) {
      throw Error(
        `parentFolderPath=${parentFolderPath} should not be in fromFileToGDEntity`
      );
    }
    keyRaw = `${parentFolderPath}${file.name}`;
  }
  const isFolder = file.mimeType === FOLDER_MIME_TYPE;
  if (isFolder) {
    keyRaw = `${keyRaw}/`;
  }

  return {
    key: keyRaw,
    keyRaw: keyRaw,
    mtimeCli: Date.parse(file.modifiedTime!),
    mtimeSvr: Date.parse(file.modifiedTime!),
    size: isFolder ? 0 : Number.parseInt(file.size!),
    sizeRaw: isFolder ? 0 : Number.parseInt(file.size!),
    hash: isFolder ? undefined : file.md5Checksum!,
    id: file.id!,
    parentID: parentID,
    parentIDPath: parentFolderPath,
    isFolder: isFolder,
  } as GDEntity;
};

export class FakeFsGoogleDrive extends FakeFs {
  kind: string;
  googleDriveConfig: GoogleDriveConfig;
  remoteBaseDir: string;
  vaultFolderExists: boolean;
  saveUpdatedConfigFunc: () => Promise<any>;

  keyToGDEntity: Record<string, GDEntity>;

  baseDirID: string;
  private initPromise?: Promise<void>;
  private mutationQueues = new Map<string, Promise<unknown>>();

  private async _withPathLock<T>(
    key: string,
    action: () => Promise<T>
  ): Promise<T> {
    const previous = this.mutationQueues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(action);
    this.mutationQueues.set(key, current);
    try {
      return await current;
    } finally {
      if (this.mutationQueues.get(key) === current)
        this.mutationQueues.delete(key);
    }
  }

  private _escapeQuery(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }

  private async _listFiles(query: string): Promise<File[]> {
    const files: File[] = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: query,
        pageSize: "1000",
        fields:
          "nextPageToken,incompleteSearch,files(id,name,mimeType,parents,size,md5Checksum,createdTime,modifiedTime,trashed)",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?${params}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${await this._getAccessToken()}` },
        }
      );
      if (response.status !== 200)
        throw Error(
          `Google Drive listing failed (${response.status}); sync stopped.`
        );
      const result = await response.json();
      if (!Array.isArray(result.files) || result.incompleteSearch) {
        throw Error(
          "Google Drive returned an incomplete file listing; sync stopped."
        );
      }
      for (const file of result.files as File[]) {
        if (!file.id || !file.name || !file.mimeType)
          throw Error(
            "Google Drive returned invalid file metadata; sync stopped."
          );
        files.push(file);
      }
      pageToken = result.nextPageToken;
    } while (pageToken);
    return files;
  }

  private _assertUnique(files: File[], path: string): void {
    const names = new Set<string>();
    for (const file of files) {
      if (names.has(file.name!)) {
        throw Error(
          `Google Drive duplicate name: ${path}${file.name}. Sync stopped. Back up and resolve duplicate files or folders before retrying; no copy was selected or deleted.`
        );
      }
      names.add(file.name!);
    }
  }

  private async _findExisting(
    key: string,
    name: string,
    parentID: string,
    parentFolderPath: string,
    isFolder: boolean
  ): Promise<GDEntity | undefined> {
    const files = await this._listFiles(
      `'${this._escapeQuery(parentID)}' in parents and name='${this._escapeQuery(name)}' and trashed=false`
    );
    this._assertUnique(files, parentFolderPath);
    const cached = this.keyToGDEntity[key];
    if (files.length === 0) {
      if (cached)
        throw Error(
          `Google Drive file disappeared: ${key}; sync again before writing.`
        );
      return undefined;
    }
    const entity = fromFileToGDEntity(files[0], parentID, parentFolderPath);
    if (entity.isFolder !== isFolder)
      throw Error(`Google Drive file/folder conflict: ${key}`);
    if (cached && cached.id !== entity.id)
      throw Error(
        `Google Drive file identity changed: ${key}; sync again before writing.`
      );
    if (
      cached &&
      (cached.mtimeSvr !== entity.mtimeSvr || cached.hash !== entity.hash)
    ) {
      throw Error(
        `Google Drive file changed during sync: ${key}; sync again before writing.`
      );
    }
    this.keyToGDEntity[key] = entity;
    return entity;
  }

  constructor(
    googleDriveConfig: GoogleDriveConfig,
    vaultName: string,
    saveUpdatedConfigFunc: () => Promise<any>
  ) {
    super();
    this.kind = "googledrive";
    this.googleDriveConfig = googleDriveConfig;
    this.remoteBaseDir =
      this.googleDriveConfig.remoteBaseDir || vaultName || "";
    this.vaultFolderExists = false;
    this.saveUpdatedConfigFunc = saveUpdatedConfigFunc;
    this.keyToGDEntity = {};
    this.baseDirID = "";
  }

  async _init() {
    if (this.vaultFolderExists) return;
    if (!this.initPromise) {
      this.initPromise = this._initOnce().finally(() => {
        this.initPromise = undefined;
      });
    }
    await this.initPromise;
  }

  private async _initOnce() {
    const files = await this._listFiles(
      `'root' in parents and name='${this._escapeQuery(this.remoteBaseDir)}' and trashed=false`
    );
    this._assertUnique(files, "");
    if (files.length) {
      if (files[0].mimeType !== FOLDER_MIME_TYPE)
        throw Error("Google Drive vault path is not a folder.");
      this.baseDirID = files[0].id!;
    } else {
      const response = await fetch(
        "https://www.googleapis.com/drive/v3/files?fields=id",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this._getAccessToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: this.remoteBaseDir,
            mimeType: FOLDER_MIME_TYPE,
            parents: ["root"],
          }),
        }
      );
      if (response.status !== 200 && response.status !== 201)
        throw Error("Cannot create Google Drive vault folder.");
      const file: File = await response.json();
      if (!file.id)
        throw Error("Google Drive did not return a vault folder ID.");
      this.baseDirID = file.id;
    }
    this.vaultFolderExists = true;
  }

  async _getAccessToken() {
    if (
      this.googleDriveConfig.accessToken === "" ||
      this.googleDriveConfig.refreshToken === ""
    ) {
      throw Error("The user has not manually auth yet.");
    }

    const ts = Date.now();
    if (this.googleDriveConfig.accessTokenExpiresAtTimeMs > ts) {
      return this.googleDriveConfig.accessToken;
    }
    // refresh
    const k = await sendRefreshTokenReq(this.googleDriveConfig.refreshToken);
    this.googleDriveConfig.accessToken = k.access_token;
    this.googleDriveConfig.accessTokenExpiresInMs = k.expires_in * 1000;
    this.googleDriveConfig.accessTokenExpiresAtTimeMs =
      ts + k.expires_in * 1000 - 60 * 2 * 1000;
    await this.saveUpdatedConfigFunc();
    console.info("Google Drive accessToken updated");
    return this.googleDriveConfig.accessToken;
  }

  /**
   * https://developers.google.com/drive/api/reference/rest/v3/files/list
   */
  async walk(): Promise<Entity[]> {
    await this._init();
    this.keyToGDEntity = {};
    const allFiles: GDEntity[] = [];
    let parents = [{ id: this.baseDirID, folderPath: "" }];
    try {
      while (parents.length) {
        const children: typeof parents = [];
        // Await every batch so listing errors reach the sync planner before any transfer.
        for (let offset = 0; offset < parents.length; offset += 5) {
          const results = await Promise.allSettled(
            parents
              .slice(offset, offset + 5)
              .map(({ id, folderPath }) => this._walkFolder(id, folderPath))
          );
          for (const result of results) {
            if (result.status === "rejected") throw result.reason;
            for (const file of result.value) {
              allFiles.push(file);
              if (file.isFolder)
                children.push({ id: file.id, folderPath: file.keyRaw });
            }
          }
        }
        parents = children;
      }
      return allFiles;
    } catch (error) {
      this.keyToGDEntity = {};
      throw error;
    }
  }

  async _walkFolder(parentID: string, parentFolderPath: string) {
    if (!parentID || parentID === "root")
      throw Error("Invalid Google Drive parent folder.");
    const files = await this._listFiles(
      `'${this._escapeQuery(parentID)}' in parents and trashed=false`
    );
    this._assertUnique(files, parentFolderPath);
    const entities = files.map((file) =>
      fromFileToGDEntity(file, parentID, parentFolderPath)
    );
    for (const entity of entities) this.keyToGDEntity[entity.keyRaw] = entity;
    return entities;
  }

  async walkPartial(): Promise<Entity[]> {
    await this._init();
    const filesInLevel = await this._walkFolder(this.baseDirID, "");
    return filesInLevel;
  }

  /**
   * https://developers.google.com/drive/api/reference/rest/v3/files/get
   * https://developers.google.com/drive/api/guides/fields-parameter
   */
  async stat(key: string): Promise<Entity> {
    await this._init();

    // TODO: we already have a cache, should we call again?
    const cachedEntity = this.keyToGDEntity[key];
    const fileID = cachedEntity?.id;
    if (cachedEntity === undefined || fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    const url: string = `https://www.googleapis.com/drive/v3/files/${fileID}?fields=kind,fileExtension,md5Checksum,mimeType,parents,size,spaces,id,name,trashed,createdTime,modifiedTime,quotaBytesUsed,originalFilename,fullFileExtension,sha1Checksum,sha256Checksum`;

    const k = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${await this._getAccessToken()}`,
      },
    });
    if (k.status !== 200) {
      throw Error(`cannot get file meta fileID=${fileID}, key=${key}`);
    }
    const k1: File = await k.json();
    const entity = fromFileToGDEntity(
      k1,
      cachedEntity.parentID!,
      cachedEntity.parentIDPath!
    );
    // insert back to cache?? to update it??
    this.keyToGDEntity[key] = entity;
    return entity;
  }

  /**
   * https://developers.google.com/drive/api/guides/folder
   */
  async mkdir(
    key: string,
    mtime: number | undefined,
    ctime: number | undefined
  ): Promise<GDEntity> {
    return this._withPathLock(key, () => this._mkdir(key, mtime, ctime));
  }

  private async _mkdir(
    key: string,
    mtime: number | undefined,
    ctime: number | undefined
  ): Promise<GDEntity> {
    if (!key.endsWith("/")) {
      throw Error(`you should not mkdir on key=${key}`);
    }

    await this._init();

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
      if (!(parentFolderPath in this.keyToGDEntity)) {
        throw Error(
          `parent of ${key}: ${parentFolderPath} is not created before??`
        );
      }
      parentID = this.keyToGDEntity[parentFolderPath].id;
    }

    // xxx/yyy/zzz/ => ["xxx", "xxx/yyy", "xxx/yyy/zzz"] => "xxx/yyy/zzz" => "zzz"
    let folderItselfWithoutSlash = folderLevels[folderLevels.length - 1];
    folderItselfWithoutSlash = folderItselfWithoutSlash.split("/").pop()!;

    const existing = await this._findExisting(
      key,
      folderItselfWithoutSlash,
      parentID,
      parentFolderPath!,
      true
    );
    if (existing) return existing;

    const meta: any = {
      mimeType: FOLDER_MIME_TYPE,
      modifiedTime: unixTimeToStr(mtime, true),
      createdTime: unixTimeToStr(ctime, true),
      name: folderItselfWithoutSlash,
      parents: [parentID],
    };
    const res = await fetch(
      "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,size,md5Checksum,createdTime,modifiedTime",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(meta),
      }
    );
    if (res.status !== 200 && res.status !== 201) {
      throw Error(`create folder ${key} failed! meta=${JSON.stringify(meta)}`);
    }
    const res2: File = await res.json();
    if (!res2.id)
      throw Error(`Google Drive did not return a folder ID for ${key}`);
    // console.debug(res2);
    const entity = fromFileToGDEntity(res2, parentID, parentFolderPath);
    // insert into cache
    this.keyToGDEntity[key] = entity;
    return entity;
  }

  /**
   * https://developers.google.com/drive/api/guides/manage-uploads
   * https://stackoverflow.com/questions/65181932/how-i-can-upload-file-to-google-drive-with-google-drive-api
   */
  async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<GDEntity> {
    return this._withPathLock(key, () =>
      this._writeFile(key, content, mtime, ctime)
    );
  }

  private async _writeFile(
    key: string,
    content: ArrayBuffer,
    mtime: number,
    ctime: number
  ): Promise<GDEntity> {
    if (key.endsWith("/")) {
      throw Error(`should not call writeFile on ${key}`);
    }

    await this._init();

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
      if (!(parentFolderPath in this.keyToGDEntity)) {
        throw Error(
          `parent of ${key}: ${parentFolderPath} is not created before??`
        );
      }
      parentID = this.keyToGDEntity[parentFolderPath].id;
    }

    const fileItself = key.split("/").pop()!;

    // Lookup is authoritative even on a cold/stale cache. Never POST after a failed PATCH.
    const existing = await this._findExisting(
      key,
      fileItself,
      parentID,
      parentFolderPath!,
      false
    );
    const method = existing ? "PATCH" : "POST";
    const uploadURL =
      "https://www.googleapis.com/upload/drive/v3/files" +
      (existing ? `/${encodeURIComponent(existing.id)}` : "");
    const meta: any = {
      name: fileItself,
      modifiedTime: unixTimeToStr(mtime, true),
    };
    if (!existing) {
      meta.createdTime = unixTimeToStr(ctime, true);
      meta.parents = [parentID];
    }

    if (content.byteLength <= 5 * 1024 * 1024) {
      // Drive expects multipart/related, not browser FormData's multipart/form-data.
      const boundary = `remotely_save_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const multipartType = `multipart/related; boundary=${boundary}`;
      const body = new Blob(
        [
          `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
          `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
          content,
          `\r\n--${boundary}--\r\n`,
        ],
        { type: multipartType }
      );

      const res = await fetch(
        `${uploadURL}?uploadType=multipart&fields=id,name,mimeType,parents,size,md5Checksum,createdTime,modifiedTime`,
        {
          method,
          headers: {
            Authorization: `Bearer ${await this._getAccessToken()}`,
            "Content-Type": multipartType,
          },
          body,
        }
      );
      if (res.status !== 200 && res.status !== 201) {
        throw Error(`create file ${key} failed! meta=${JSON.stringify(meta)}`);
      }
      const res2: File = await res.json();
      if (!res2.id || (existing && res2.id !== existing.id))
        throw Error(`Unexpected Google Drive file ID after writing ${key}`);
      console.debug(
        `upload ${key} with ${JSON.stringify(meta)}, res2=${JSON.stringify(
          res2
        )}`
      );
      const entity = fromFileToGDEntity(res2, parentID, parentFolderPath);
      // insert into cache
      this.keyToGDEntity[key] = entity;
      return entity;
    } else {
      const bodyStr = JSON.stringify(meta);
      const headers: HeadersInit = {
        Authorization: `Bearer ${await this._getAccessToken()}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": `${content.byteLength}`,
      };
      const res = await fetch(
        `${uploadURL}?uploadType=resumable&fields=id,name,mimeType,parents,size,md5Checksum,createdTime,modifiedTime`,
        {
          method,
          headers: headers,
          body: bodyStr,
        }
      );
      if (res.status !== 200) {
        throw Error(
          `create resumable file ${key} failed! meta=${JSON.stringify(meta)}`
        );
      }
      const uploadLocation = res.headers.get("Location");
      if (
        uploadLocation === null ||
        !uploadLocation.startsWith("https://www.googleapis.com/")
      ) {
        throw Error(
          `create resumable file ${key} failed! meta=${JSON.stringify(meta)}`
        );
      }

      // multiples of 256 KB (256 x 1024 bytes) in size
      const sizePerChunk = 5 * 4 * 256 * 1024; // 5.24 mb
      const chunkRanges = splitFileSizeToChunkRanges(
        content.byteLength,
        sizePerChunk
      );

      let entity: GDEntity | undefined = undefined;

      // TODO: deal with "Resume an interrupted upload"
      // currently (202405) only assume everything goes well...
      // TODO: parallel
      for (const { start, end } of chunkRanges) {
        console.debug(
          `key=${key}, start upload chunk ${start}-${end}/${content.byteLength}`
        );
        const res = await fetch(uploadLocation, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${await this._getAccessToken()}`,
            "Content-Range": `bytes ${start}-${end}/${content.byteLength}`,
          },
          body: content.slice(start, end + 1), // TODO: slice() is a copy, may be we can optimize it
        });
        if (res.status >= 400 && res.status <= 599) {
          throw Error(
            `create resumable file ${key} failed! meta=${JSON.stringify(meta)}`
          );
        }

        if (res.status === 200 || res.status === 201) {
          const res2: File = await res.json();
          console.debug(
            `upload ${key} with ${JSON.stringify(meta)}, res2=${JSON.stringify(
              res2
            )}`
          );
          if (!res2.id || (existing && res2.id !== existing.id)) {
            throw Error(`Unexpected Google Drive file ID after writing ${key}`);
          } else {
            entity = fromFileToGDEntity(res2, parentID, parentFolderPath);
            // insert into cache
            this.keyToGDEntity[key] = entity;
          }
        }
      }

      if (entity === undefined) {
        throw Error(`something goes wrong while uploading large file ${key}`);
      }
      return entity;
    }
  }

  /**
   * https://developers.google.com/drive/api/reference/rest/v3/files/get
   */
  async readFile(key: string): Promise<ArrayBuffer> {
    if (key.endsWith("/")) {
      throw Error(`you should not call readFile on ${key}`);
    }

    await this._init();

    const fileID = this.keyToGDEntity[key]?.id;
    if (fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    const res1 = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileID}?alt=media`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
        },
      }
    );
    if (res1.status !== 200) {
      throw Error(`cannot download ${key} using fileID=${fileID}`);
    }
    const res2 = await res1.arrayBuffer();
    return res2;
  }

  async rename(key1: string, key2: string): Promise<void> {
    throw new Error("Method not implemented.");
  }

  /**
   * https://developers.google.com/drive/api/guides/delete
   * https://developers.google.com/drive/api/reference/rest/v3/files/update
   */
  async rm(key: string): Promise<void> {
    await this._init();

    const fileID = this.keyToGDEntity[key]?.id;
    if (fileID === undefined) {
      throw Error(`no fileID found for key=${key}`);
    }

    const res1 = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileID}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trashed: true,
        }),
      }
    );
    if (res1.status !== 200) {
      throw Error(`cannot rm ${key} using fileID=${fileID}`);
    }
    delete this.keyToGDEntity[key];
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
   * https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
   */
  async revokeAuth(): Promise<any> {
    const x = await fetch(
      `https://oauth2.googleapis.com/revoke?token=${this._getAccessToken()}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    if (x.status === 200) {
      return true;
    } else {
      throw Error(`cannot revoke`);
    }
  }

  allowEmptyFile(): boolean {
    return true;
  }
}
