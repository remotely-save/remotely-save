import localforage from "localforage";
import { TAbstractFile, TFile, TFolder } from "obsidian";

import type { SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import type { SyncPlanType } from "./sync";

export type LocalForage = typeof localforage;

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

const DB_VERSION_NUMBER_IN_HISTORY = [20211114, 20220108];
export const DEFAULT_DB_VERSION_NUMBER: number = 20220108;
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
  vaultRandomID: string;
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
  vaultRandomID: string;
}

interface SyncPlanRecord {
  ts: number;
  remoteType: string;
  syncPlan: string;
  vaultRandomID: string;
}

export interface InternalDBs {
  versionTbl: LocalForage;
  deleteHistoryTbl: LocalForage;
  syncMappingTbl: LocalForage;
  syncPlansTbl: LocalForage;
}

/**
 * This migration mainly aims to assign vault name or vault id into all tables.
 * @param db
 * @param vaultRandomID
 */
const migrateDBsFrom20211114To20220108 = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const oldVer = 20211114;
  const newVer = 20220108;
  log.debug(`start upgrading internal db from ${oldVer} to ${newVer}`);

  const allPromisesToWait: Promise<any>[] = [];

  log.debug("assign vault id to any delete history");
  const keysInDeleteHistoryTbl = await db.deleteHistoryTbl.keys();
  for (const key of keysInDeleteHistoryTbl) {
    if (key.startsWith(vaultRandomID)) {
      continue;
    }
    const value = (await db.deleteHistoryTbl.getItem(
      key
    )) as FileFolderHistoryRecord;
    if (value === null || value === undefined) {
      continue;
    }
    if (value.vaultRandomID === undefined || value.vaultRandomID === "") {
      value.vaultRandomID = vaultRandomID;
    }
    const newKey = `${vaultRandomID}\t${key}`;
    allPromisesToWait.push(db.deleteHistoryTbl.setItem(newKey, value));
    allPromisesToWait.push(db.deleteHistoryTbl.removeItem(key));
  }

  log.debug("assign vault id to any sync mapping");
  const keysInSyncMappingTbl = await db.syncMappingTbl.keys();
  for (const key of keysInSyncMappingTbl) {
    if (key.startsWith(vaultRandomID)) {
      continue;
    }
    const value = (await db.syncMappingTbl.getItem(
      key
    )) as SyncMetaMappingRecord;
    if (value === null || value === undefined) {
      continue;
    }
    if (value.vaultRandomID === undefined || value.vaultRandomID === "") {
      value.vaultRandomID = vaultRandomID;
    }
    const newKey = `${vaultRandomID}\t${key}`;
    allPromisesToWait.push(db.syncMappingTbl.setItem(newKey, value));
    allPromisesToWait.push(db.syncMappingTbl.removeItem(key));
  }

  log.debug("assign vault id to any sync plan records");
  const keysInSyncPlansTbl = await db.syncPlansTbl.keys();
  for (const key of keysInSyncPlansTbl) {
    if (key.startsWith(vaultRandomID)) {
      continue;
    }
    const value = (await db.syncPlansTbl.getItem(key)) as SyncPlanRecord;
    if (value === null || value === undefined) {
      continue;
    }
    if (value.vaultRandomID === undefined || value.vaultRandomID === "") {
      value.vaultRandomID = vaultRandomID;
    }
    const newKey = `${vaultRandomID}\t${key}`;
    allPromisesToWait.push(db.syncPlansTbl.setItem(newKey, value));
    allPromisesToWait.push(db.syncPlansTbl.removeItem(key));
  }

  log.debug("finally update version if everything is ok");
  await Promise.all(allPromisesToWait);
  await db.versionTbl.setItem("version", newVer);

  log.debug(`finish upgrading internal db from ${oldVer} to ${newVer}`);
};

const migrateDBs = async (
  db: InternalDBs,
  oldVer: number,
  newVer: number,
  vaultRandomID: string
) => {
  if (oldVer === newVer) {
    return;
  }
  if (oldVer === 20211114 && newVer === 20220108) {
    return await migrateDBsFrom20211114To20220108(db, vaultRandomID);
  }
  // not implemented
  throw Error(`not supported internal db changes from ${oldVer} to ${newVer}`);
};

export const prepareDBs = async (vaultRandomID: string) => {
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
    log.debug(
      `no internal db version, setting it to ${DEFAULT_DB_VERSION_NUMBER}`
    );
    await db.versionTbl.setItem("version", DEFAULT_DB_VERSION_NUMBER);
  } else if (originalVersion === DEFAULT_DB_VERSION_NUMBER) {
    // do nothing
  } else {
    log.debug(
      `trying to upgrade db version from ${originalVersion} to ${DEFAULT_DB_VERSION_NUMBER}`
    );
    await migrateDBs(
      db,
      originalVersion,
      DEFAULT_DB_VERSION_NUMBER,
      vaultRandomID
    );
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

export const loadDeleteRenameHistoryTableByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const records = [] as FileFolderHistoryRecord[];
  await db.deleteHistoryTbl.iterate((value, key, iterationNumber) => {
    if (key.startsWith(`${vaultRandomID}\t`)) {
      records.push(value as FileFolderHistoryRecord);
    }
  });
  records.sort((a, b) => a.actionWhen - b.actionWhen); // ascending
  return records;
};

export const clearDeleteRenameHistoryOfKeyAndVault = async (
  db: InternalDBs,
  key: string,
  vaultRandomID: string
) => {
  await db.deleteHistoryTbl.removeItem(`${vaultRandomID}\t${key}`);
};

export const insertDeleteRecordByVault = async (
  db: InternalDBs,
  fileOrFolder: TAbstractFile,
  vaultRandomID: string
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
      vaultRandomID: vaultRandomID,
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
      vaultRandomID: vaultRandomID,
    };
  }
  await db.deleteHistoryTbl.setItem(`${vaultRandomID}\t${k.key}`, k);
};

export const insertRenameRecordByVault = async (
  db: InternalDBs,
  fileOrFolder: TAbstractFile,
  oldPath: string,
  vaultRandomID: string
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
      vaultRandomID: vaultRandomID,
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
      vaultRandomID: vaultRandomID,
    };
  }
  await db.deleteHistoryTbl.setItem(`${vaultRandomID}\t${k.key}`, k);
};

export const upsertSyncMetaMappingDataByVault = async (
  serviceType: SUPPORTED_SERVICES_TYPE,
  db: InternalDBs,
  localKey: string,
  localMTime: number,
  localSize: number,
  remoteKey: string,
  remoteMTime: number,
  remoteSize: number,
  remoteExtraKey: string,
  vaultRandomID: string
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
    vaultRandomID: vaultRandomID,
  };
  await db.syncMappingTbl.setItem(
    `${vaultRandomID}\t${remoteKey}`,
    aggregratedInfo
  );
};

export const getSyncMetaMappingByRemoteKeyAndVault = async (
  serviceType: SUPPORTED_SERVICES_TYPE,
  db: InternalDBs,
  remoteKey: string,
  remoteMTime: number,
  remoteExtraKey: string,
  vaultRandomID: string
) => {
  const potentialItem = (await db.syncMappingTbl.getItem(
    `${vaultRandomID}\t${remoteKey}`
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

export const insertSyncPlanRecordByVault = async (
  db: InternalDBs,
  syncPlan: SyncPlanType,
  vaultRandomID: string
) => {
  const record = {
    ts: syncPlan.ts,
    vaultRandomID: vaultRandomID,
    remoteType: syncPlan.remoteType,
    syncPlan: JSON.stringify(syncPlan /* directly stringify */, null, 2),
  } as SyncPlanRecord;
  await db.syncPlansTbl.setItem(`${vaultRandomID}\t${syncPlan.ts}`, record);
};

export const clearAllSyncPlanRecords = async (db: InternalDBs) => {
  await db.syncPlansTbl.clear();
};

export const readAllSyncPlanRecordTextsByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const records = [] as SyncPlanRecord[];
  await db.syncPlansTbl.iterate((value, key, iterationNumber) => {
    if (key.startsWith(`${vaultRandomID}\t`)) {
      records.push(value as SyncPlanRecord);
    }
  });
  records.sort((a, b) => -(a.ts - b.ts)); // descending

  if (records === undefined) {
    return [] as string[];
  } else {
    return records.map((x) => x.syncPlan);
  }
};
