import localforage from "localforage";
import { TAbstractFile, TFile, TFolder } from "obsidian";

import type { SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import type { SyncPlanType } from "./sync";

export type LocalForage = typeof localforage;

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

export const DEFAULT_DB_VERSION_NUMBER: number = 20211114;
export const DEFAULT_DB_NAME = "remotelysavedb";
export const DEFAULT_TBL_VERSION = "schemaversion";
export const DEFAULT_TBL_DELETE_HISTORY = "filefolderoperationhistory";
export const DEFAULT_TBL_SYNC_MAPPING = "syncmetadatahistory";
export const DEFAULT_SYNC_PLANS_HISTORY = "syncplanshistory";

export interface FileFolderHistoryRecord {
  key: string;
  ctime: number;
  mtime: number;
  size: number;
  actionWhen: number;
  actionType: "delete" | "rename";
  keyType: "folder" | "file";
  renameTo: string;
}

interface SyncMetaMappingRecord {
  localKey: string;
  remoteKey: string;
  localSize: number;
  remoteSize: number;
  localMtime: number;
  remoteMtime: number;
  remoteExtraKey: string;
  remoteType: SUPPORTED_SERVICES_TYPE;
  keyType: "folder" | "file";
}

interface SyncPlanRecord {
  ts: number;
  remoteType: string;
  syncPlan: string;
}

export interface InternalDBs {
  versionTbl: LocalForage;
  deleteHistoryTbl: LocalForage;
  syncMappingTbl: LocalForage;
  syncPlansTbl: LocalForage;
}

export const prepareDBs = async () => {
  const db = {
    versionTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_VERSION,
    }),
    deleteHistoryTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_DELETE_HISTORY,
    }),
    syncMappingTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_SYNC_MAPPING,
    }),
    syncPlansTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_SYNC_PLANS_HISTORY,
    }),
  } as InternalDBs;

  const originalVersion = (await db.versionTbl.getItem("version")) as number;
  if (originalVersion === null) {
    await db.versionTbl.setItem("version", DEFAULT_DB_VERSION_NUMBER);
  } else if (originalVersion === DEFAULT_DB_VERSION_NUMBER) {
    // do nothing
  } else {
    await migrateDBs(db, originalVersion, DEFAULT_DB_VERSION_NUMBER);
  }

  log.info("db connected");
  return db;
};

export const destroyDBs = async () => {
  // await localforage.dropInstance({
  //   name: DEFAULT_DB_NAME,
  // });
  // log.info("db deleted");
  const req = indexedDB.deleteDatabase(DEFAULT_DB_NAME);
  req.onsuccess = (event) => {
    log.info("db deleted");
  };
  req.onblocked = (event) => {
    console.warn("trying to delete db but it was blocked");
  };
  req.onerror = (event) => {
    console.error("tried to delete db but something bad!");
    console.error(event);
  };
};

const migrateDBs = async (db: InternalDBs, oldVer: number, newVer: number) => {
  if (oldVer === newVer) {
    return;
  }
  // not implemented
  throw Error(`not supported internal db changes from ${oldVer} to ${newVer}`);
};

export const loadDeleteRenameHistoryTable = async (db: InternalDBs) => {
  const records = [] as FileFolderHistoryRecord[];
  await db.deleteHistoryTbl.iterate((value, key, iterationNumber) => {
    records.push(value as FileFolderHistoryRecord);
  });
  records.sort((a, b) => a.actionWhen - b.actionWhen); // ascending
  return records;
};

export const clearDeleteRenameHistoryOfKey = async (
  db: InternalDBs,
  key: string
) => {
  await db.deleteHistoryTbl.removeItem(key);
};

export const insertDeleteRecord = async (
  db: InternalDBs,
  fileOrFolder: TAbstractFile
) => {
  // log.info(fileOrFolder);
  let k: FileFolderHistoryRecord;
  if (fileOrFolder instanceof TFile) {
    k = {
      key: fileOrFolder.path,
      ctime: fileOrFolder.stat.ctime,
      mtime: fileOrFolder.stat.mtime,
      size: fileOrFolder.stat.size,
      actionWhen: Date.now(),
      actionType: "delete",
      keyType: "file",
      renameTo: "",
    };
  } else if (fileOrFolder instanceof TFolder) {
    // key should endswith "/"
    const key = fileOrFolder.path.endsWith("/")
      ? fileOrFolder.path
      : `${fileOrFolder.path}/`;
    k = {
      key: key,
      ctime: 0,
      mtime: 0,
      size: 0,
      actionWhen: Date.now(),
      actionType: "delete",
      keyType: "folder",
      renameTo: "",
    };
  }
  await db.deleteHistoryTbl.setItem(k.key, k);
};

export const insertRenameRecord = async (
  db: InternalDBs,
  fileOrFolder: TAbstractFile,
  oldPath: string
) => {
  // log.info(fileOrFolder);
  let k: FileFolderHistoryRecord;
  if (fileOrFolder instanceof TFile) {
    k = {
      key: oldPath,
      ctime: fileOrFolder.stat.ctime,
      mtime: fileOrFolder.stat.mtime,
      size: fileOrFolder.stat.size,
      actionWhen: Date.now(),
      actionType: "rename",
      keyType: "file",
      renameTo: fileOrFolder.path,
    };
  } else if (fileOrFolder instanceof TFolder) {
    const key = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
    const renameTo = fileOrFolder.path.endsWith("/")
      ? fileOrFolder.path
      : `${fileOrFolder.path}/`;
    k = {
      key: key,
      ctime: 0,
      mtime: 0,
      size: 0,
      actionWhen: Date.now(),
      actionType: "rename",
      keyType: "folder",
      renameTo: renameTo,
    };
  }
  await db.deleteHistoryTbl.setItem(k.key, k);
};

export const upsertSyncMetaMappingData = async (
  serviceType: SUPPORTED_SERVICES_TYPE,
  db: InternalDBs,
  localKey: string,
  localMTime: number,
  localSize: number,
  remoteKey: string,
  remoteMTime: number,
  remoteSize: number,
  remoteExtraKey: string /* ETag from s3 */
) => {
  const aggregratedInfo: SyncMetaMappingRecord = {
    localKey: localKey,
    localMtime: localMTime,
    localSize: localSize,
    remoteKey: remoteKey,
    remoteMtime: remoteMTime,
    remoteSize: remoteSize,
    remoteExtraKey: remoteExtraKey,
    remoteType: serviceType,
    keyType: localKey.endsWith("/") ? "folder" : "file",
  };
  await db.syncMappingTbl.setItem(remoteKey, aggregratedInfo);
};

export const getSyncMetaMappingByRemoteKey = async (
  serviceType: SUPPORTED_SERVICES_TYPE,
  db: InternalDBs,
  remoteKey: string,
  remoteMTime: number,
  remoteExtraKey: string
) => {
  const potentialItem = (await db.syncMappingTbl.getItem(
    remoteKey
  )) as SyncMetaMappingRecord;

  if (potentialItem === null) {
    // no result was found
    return undefined;
  }

  if (
    potentialItem.remoteKey === remoteKey &&
    potentialItem.remoteMtime === remoteMTime &&
    potentialItem.remoteExtraKey === remoteExtraKey &&
    potentialItem.remoteType === serviceType
  ) {
    // the result was found
    return potentialItem;
  } else {
    return undefined;
  }
};

export const clearAllSyncMetaMapping = async (db: InternalDBs) => {
  await db.syncMappingTbl.clear();
};

export const insertSyncPlanRecord = async (
  db: InternalDBs,
  syncPlan: SyncPlanType
) => {
  const record = {
    ts: syncPlan.ts,
    remoteType: syncPlan.remoteType,
    syncPlan: JSON.stringify(syncPlan /* directly stringify */, null, 2),
  } as SyncPlanRecord;
  await db.syncPlansTbl.setItem(`${syncPlan.ts}`, record);
};

export const clearAllSyncPlanRecords = async (db: InternalDBs) => {
  await db.syncPlansTbl.clear();
};

export const readAllSyncPlanRecordTexts = async (db: InternalDBs) => {
  const records = [] as SyncPlanRecord[];
  await db.syncPlansTbl.iterate((value, key, iterationNumber) => {
    records.push(value as SyncPlanRecord);
  });
  records.sort((a, b) => -(a.ts - b.ts)); // descending

  if (records === undefined) {
    return [] as string[];
  } else {
    return records.map((x) => x.syncPlan);
  }
};
