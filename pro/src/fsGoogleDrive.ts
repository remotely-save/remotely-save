// https://developers.google.com/identity/protocols/oauth2/native-app
// https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
// https://developers.google.com/identity/protocols/oauth2/web-server

import { entries } from "lodash";
import * as mime from "mime-types";
import { requestUrl } from "obsidian";
import PQueue from "p-queue";
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
    // get accessToken
    await this._getAccessToken();

    // check vault folder exists
    if (this.vaultFolderExists) {
      // pass
    } else {
      const q = encodeURIComponent(
        `name='${this.remoteBaseDir}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
      );
      const url: string = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&fields=kind,nextPageToken,files(kind,fileExtension,md5Checksum,mimeType,parents,size,spaces,id,name,trashed,createdTime,modifiedTime,quotaBytesUsed,originalFilename,fullFileExtension,sha1Checksum,sha256Checksum)`;
      const k = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
        },
      });

      const k1: { files: File[] } = await k.json();
      // console.debug(k1);
      if (k1.files.length > 0) {
        // yeah we find it
        this.baseDirID = k1.files[0].id!;
        this.vaultFolderExists = true;
      } else {
        // wait, we need to create the folder!
        console.debug(`we need to create the base dir ${this.remoteBaseDir}`);
        const meta: any = {
          mimeType: FOLDER_MIME_TYPE,
          name: this.remoteBaseDir,
        };
        const res = await fetch("https://www.googleapis.com/drive/v3/files", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this._getAccessToken()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(meta),
        });
        const res2: File = await res.json();
        if (res.status === 200) {
          console.debug(`succeed to create the base dir ${this.remoteBaseDir}`);
          this.baseDirID = res2.id!;
          this.vaultFolderExists = true;
        } else {
          throw Error(
            `cannot create base dir ${this.remoteBaseDir} in init func.`
          );
        }
      }
    }
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
    const allFiles: GDEntity[] = [];

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
    // console.debug(this.keyToGDEntity);
    return allFiles;
  }

  async _walkFolder(parentID: string, parentFolderPath: string) {
    // console.debug(
    //   `input of single level: parentID=${parentID}, parentFolderPath=${parentFolderPath}`
    // );
    const filesOneLevel: GDEntity[] = [];
    let nextPageToken: string | undefined = undefined;
    if (parentID === undefined || parentID === "" || parentID === "root") {
      // we should never start from root
      // because we encapsulate the vault inside a folder
      throw Error(`something goes wrong walking folder`);
    }
    do {
      const q = encodeURIComponent(
        `'${parentID}' in parents and trashed=false`
      );
      const pageToken =
        nextPageToken !== undefined ? `&pageToken=${nextPageToken}` : "";

      const url: string = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=1000&fields=kind,nextPageToken,files(kind,fileExtension,md5Checksum,mimeType,parents,size,spaces,id,name,trashed,createdTime,modifiedTime,quotaBytesUsed,originalFilename,fullFileExtension,sha1Checksum,sha256Checksum)${pageToken}`;

      const k = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${await this._getAccessToken()}`,
        },
      });
      if (k.status !== 200) {
        throw Error(`cannot walk for parentID=${parentID}`);
      }

      const k1 = await k.json();
      // console.debug(k1);
      for (const file of k1.files as File[]) {
        const entity = fromFileToGDEntity(file, parentID, parentFolderPath);
        this.keyToGDEntity[entity.keyRaw] = entity; // build cache
        filesOneLevel.push(entity);
      }

      nextPageToken = k1.nextPageToken;
    } while (nextPageToken !== undefined);

    // console.debug(filesOneLevel);

    return filesOneLevel;
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
  ): Promise<Entity> {
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

    const meta: any = {
      mimeType: FOLDER_MIME_TYPE,
      modifiedTime: unixTimeToStr(mtime, true),
      createdTime: unixTimeToStr(ctime, true),
      name: folderItselfWithoutSlash,
      parents: [parentID],
    };
    const res = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await this._getAccessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(meta),
    });
    if (res.status !== 200 && res.status !== 201) {
      throw Error(`create folder ${key} failed! meta=${JSON.stringify(meta)}`);
    }
    const res2: File = await res.json();
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
  ): Promise<Entity> {
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

    if (content.byteLength <= 5 * 1024 * 1024) {
      const formData = new FormData();
      const meta: any = {
        name: fileItself,
        modifiedTime: unixTimeToStr(mtime, true),
        createdTime: unixTimeToStr(ctime, true),
        parents: [parentID],
      };
      formData.append(
        "metadata",
        new Blob([JSON.stringify(meta)], {
          type: "application/json; charset=UTF-8",
        })
      );
      formData.append("media", new Blob([content], { type: contentType }));

      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=kind,fileExtension,md5Checksum,mimeType,parents,size,spaces,id,name,trashed,createdTime,modifiedTime,quotaBytesUsed,originalFilename,fullFileExtension,sha1Checksum,sha256Checksum",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${await this._getAccessToken()}`,
          },
          body: formData,
        }
      );
      if (res.status !== 200 && res.status !== 201) {
        throw Error(`create file ${key} failed! meta=${JSON.stringify(meta)}`);
      }
      const res2: File = await res.json();
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
      const meta: any = {
        name: fileItself,
        modifiedTime: unixTimeToStr(mtime, true),
        createdTime: unixTimeToStr(ctime, true),
        parents: [parentID],
      };
      const bodyStr = JSON.stringify(meta);
      const headers: HeadersInit = {
        Authorization: `Bearer ${await this._getAccessToken()}`,
        "Content-Type": "application/json",
        "Content-Length": `${bodyStr.length}`,
        "X-Upload-Content-Type": contentType,
        "X-Upload-Content-Length": `${content.byteLength}`,
      };
      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=kind,fileExtension,md5Checksum,mimeType,parents,size,spaces,id,name,trashed,createdTime,modifiedTime,quotaBytesUsed,originalFilename,fullFileExtension,sha1Checksum,sha256Checksum",
        {
          method: "POST",
          headers: headers,
          body: bodyStr,
        }
      );
      if (res.status !== 200) {
        throw Error(
          `create resumable file ${key} failed! meta=${JSON.stringify(
            meta
          )}, header=${JSON.stringify(headers)}`
        );
      }
      const uploadLocation = res.headers.get("Location");
      if (uploadLocation === null || !uploadLocation.startsWith("http")) {
        throw Error(
          `create resumable file ${key} failed! meta=${JSON.stringify(
            meta
          )}, header=${JSON.stringify(headers)}`
        );
      }
      console.debug(`key=${key}, uploadLocaltion=${uploadLocation}`);

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
            "Content-Length": `${end - start + 1}`, // the number of bytes in the current chunk
            "Content-Range": `bytes ${start}-${end}/${content.byteLength}`,
          },
          body: content.slice(start, end + 1), // TODO: slice() is a copy, may be we can optimize it
        });
        if (res.status >= 400 && res.status <= 599) {
          throw Error(
            `create resumable file ${key} failed! meta=${JSON.stringify(
              meta
            )}, header=${JSON.stringify(headers)}`
          );
        }

        if (res.status === 200 || res.status === 201) {
          const res2: File = await res.json();
          console.debug(
            `upload ${key} with ${JSON.stringify(meta)}, res2=${JSON.stringify(
              res2
            )}`
          );
          if (res2.id === undefined || res2.id === null || res2.id === "") {
            // TODO: what's this??
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
        },
        body: JSON.stringify({
          trashed: true,
        }),
      }
    );
    if (res1.status !== 200) {
      throw Error(`cannot rm ${key} using fileID=${fileID}`);
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
