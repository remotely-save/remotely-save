import localforage from "localforage";
export type LocalForage = typeof localforage;
import { nanoid } from "nanoid";
import { requireApiVersion, TAbstractFile, TFile, TFolder } from "obsidian";

import { API_VER_STAT_FOLDER, SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import type { SyncPlanType } from "./sync";
import { statFix, toText, unixTimeToStr } from "./misc";

import { log } from "./moreOnLog";

const DB_VERSION_NUMBER_IN_HISTORY = [20211114, 20220108, 20220326];
export const DEFAULT_DB_VERSION_NUMBER: number = 20220326;
export const DEFAULT_DB_NAME = "remotelysavedb";
export const DEFAULT_TBL_VERSION = "schemaversion";
export const DEFAULT_TBL_FILE_HISTORY = "filefolderoperationhistory";
export const DEFAULT_TBL_SYNC_MAPPING = "syncmetadatahistory";
export const DEFAULT_SYNC_PLANS_HISTORY = "syncplanshistory";
export const DEFAULT_TBL_VAULT_RANDOM_ID_MAPPING = "vaultrandomidmapping";
export const DEFAULT_TBL_LOGGER_OUTPUT = "loggeroutput";
export const DEFAULT_TBL_SIMPLE_KV_FOR_MISC = "simplekvformisc";

export interface FileFolderHistoryRecord {
  key: string;
  ctime: number;
  mtime: number;
  size: number;
  actionWhen: number;
  actionType: "delete" | "rename" | "renameDestination";
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
  fileHistoryTbl: LocalForage;
  syncMappingTbl: LocalForage;
  syncPlansTbl: LocalForage;
  vaultRandomIDMappingTbl: LocalForage;
  loggerOutputTbl: LocalForage;
  simpleKVForMiscTbl: LocalForage;
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
  const keysInDeleteHistoryTbl = await db.fileHistoryTbl.keys();
  for (const key of keysInDeleteHistoryTbl) {
    if (key.startsWith(vaultRandomID)) {
      continue;
    }
    const value = (await db.fileHistoryTbl.getItem(
      key
    )) as FileFolderHistoryRecord;
    if (value === null || value === undefined) {
      continue;
    }
    if (value.vaultRandomID === undefined || value.vaultRandomID === "") {
      value.vaultRandomID = vaultRandomID;
    }
    const newKey = `${vaultRandomID}\t${key}`;
    allPromisesToWait.push(db.fileHistoryTbl.setItem(newKey, value));
    allPromisesToWait.push(db.fileHistoryTbl.removeItem(key));
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

/**
 * no need to do anything except changing version
 * we just add more file operations in db, and no schema is changed.
 * @param db
 * @param vaultRandomID
 */
const migrateDBsFrom20220108To20220326 = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const oldVer = 20220108;
  const newVer = 20220326;
  log.debug(`start upgrading internal db from ${oldVer} to ${newVer}`);
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
  if (oldVer === 20220108 && newVer === 20220326) {
    return await migrateDBsFrom20220108To20220326(db, vaultRandomID);
  }
  if (oldVer === 20211114 && newVer === 20220326) {
    // TODO: more steps with more versions in the future
    await migrateDBsFrom20211114To20220108(db, vaultRandomID);
    await migrateDBsFrom20220108To20220326(db, vaultRandomID);
    return;
  }
  if (newVer < oldVer) {
    throw Error(
      "You've installed a new version, but then downgrade to an old version. Stop working!"
    );
  }
  // not implemented
  throw Error(`not supported internal db changes from ${oldVer} to ${newVer}`);
};

export const prepareDBs = async (
  vaultBasePath: string,
  vaultRandomIDFromOldConfigFile: string
) => {
  const db = {
    versionTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_VERSION,
    }),
    fileHistoryTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_FILE_HISTORY,
    }),
    syncMappingTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_SYNC_MAPPING,
    }),
    syncPlansTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_SYNC_PLANS_HISTORY,
    }),
    vaultRandomIDMappingTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_VAULT_RANDOM_ID_MAPPING,
    }),
    loggerOutputTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_LOGGER_OUTPUT,
    }),
    simpleKVForMiscTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_SIMPLE_KV_FOR_MISC,
    }),
  } as InternalDBs;

  // try to get vaultRandomID firstly
  let vaultRandomID = "";
  const vaultRandomIDInDB: string | null =
    await db.vaultRandomIDMappingTbl.getItem(`path2id\t${vaultBasePath}`);
  if (vaultRandomIDInDB === null) {
    if (vaultRandomIDFromOldConfigFile !== "") {
      // reuse the old config id
      vaultRandomID = vaultRandomIDFromOldConfigFile;
    } else {
      // no old config id, we create a random one
      vaultRandomID = nanoid();
    }
    // save the id back
    await db.vaultRandomIDMappingTbl.setItem(
      `path2id\t${vaultBasePath}`,
      vaultRandomID
    );
    await db.vaultRandomIDMappingTbl.setItem(
      `id2path\t${vaultRandomID}`,
      vaultBasePath
    );
  } else {
    vaultRandomID = vaultRandomIDInDB;
  }

  if (vaultRandomID === "") {
    throw Error("no vaultRandomID found or generated");
  }

  const originalVersion: number | null = await db.versionTbl.getItem("version");
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
  return {
    db: db,
    vaultRandomID: vaultRandomID,
  };
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
    log.warn("trying to delete db but it was blocked");
  };
  req.onerror = (event) => {
    log.error("tried to delete db but something goes wrong!");
    log.error(event);
  };
};

export const loadFileHistoryTableByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const records = [] as FileFolderHistoryRecord[];
  await db.fileHistoryTbl.iterate((value, key, iterationNumber) => {
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
  const fullKey = `${vaultRandomID}\t${key}`;
  const item: FileFolderHistoryRecord | null =
    await db.fileHistoryTbl.getItem(fullKey);
  if (
    item !== null &&
    (item.actionType === "delete" || item.actionType === "rename")
  ) {
    await db.fileHistoryTbl.removeItem(fullKey);
  }
};

export const insertDeleteRecordByVault = async (
  db: InternalDBs,
  fileOrFolder: TAbstractFile | string,
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
    await db.fileHistoryTbl.setItem(`${vaultRandomID}\t${k.key}`, k);
  } else if (fileOrFolder instanceof TFolder) {
    // key should endswith "/"
    const key = fileOrFolder.path.endsWith("/")
      ? fileOrFolder.path
      : `${fileOrFolder.path}/`;
    const ctime = 0; // they are deleted, so no way to get ctime, mtime
    const mtime = 0; // they are deleted, so no way to get ctime, mtime
    k = {
      key: key,
      ctime: ctime,
      mtime: mtime,
      size: 0,
      actionWhen: Date.now(),
      actionType: "delete",
      keyType: "folder",
      renameTo: "",
      vaultRandomID: vaultRandomID,
    };
    await db.fileHistoryTbl.setItem(`${vaultRandomID}\t${k.key}`, k);
  } else if (typeof fileOrFolder === "string") {
    // always the deletions in .obsidian folder
    // so annoying that the path doesn't exists
    // and we have to guess whether the path is folder or file
    k = {
      key: fileOrFolder,
      ctime: 0,
      mtime: 0,
      size: 0,
      actionWhen: Date.now(),
      actionType: "delete",
      keyType: "file",
      renameTo: "",
      vaultRandomID: vaultRandomID,
    };
    await db.fileHistoryTbl.setItem(`${vaultRandomID}\t${k.key}`, k);
    for (const ext of [
      "json",
      "js",
      "mjs",
      "ts",
      "md",
      "txt",
      "css",
      "png",
      "gif",
      "jpg",
      "jpeg",
      "gitignore",
      "gitkeep",
    ]) {
      if (fileOrFolder.endsWith(`.${ext}`)) {
        // stop here, no more need to insert the folder record later
        return;
      }
    }
    // also add a deletion record as folder if not ending with special exts
    k = {
      key: `${fileOrFolder}/`,
      ctime: 0,
      mtime: 0,
      size: 0,
      actionWhen: Date.now(),
      actionType: "delete",
      keyType: "folder",
      renameTo: "",
      vaultRandomID: vaultRandomID,
    };
    await db.fileHistoryTbl.setItem(`${vaultRandomID}\t${k.key}`, k);
  }
};

/**
 * A file/folder is renamed from A to B
 * We insert two records:
 * A with actionType="rename"
 * B with actionType="renameDestination"
 * @param db
 * @param fileOrFolder
 * @param oldPath
 * @param vaultRandomID
 */
export const insertRenameRecordByVault = async (
  db: InternalDBs,
  fileOrFolder: TAbstractFile,
  oldPath: string,
  vaultRandomID: string
) => {
  // log.info(fileOrFolder);
  let k1: FileFolderHistoryRecord | undefined;
  let k2: FileFolderHistoryRecord | undefined;
  const actionWhen = Date.now();
  if (fileOrFolder instanceof TFile) {
    k1 = {
      key: oldPath,
      ctime: fileOrFolder.stat.ctime,
      mtime: fileOrFolder.stat.mtime,
      size: fileOrFolder.stat.size,
      actionWhen: actionWhen,
      actionType: "rename",
      keyType: "file",
      renameTo: fileOrFolder.path,
      vaultRandomID: vaultRandomID,
    };
    k2 = {
      key: fileOrFolder.path,
      ctime: fileOrFolder.stat.ctime,
      mtime: fileOrFolder.stat.mtime,
      size: fileOrFolder.stat.size,
      actionWhen: actionWhen,
      actionType: "renameDestination",
      keyType: "file",
      renameTo: "", // itself is the destination, so no need to set this field
      vaultRandomID: vaultRandomID,
    };
  } else if (fileOrFolder instanceof TFolder) {
    const key = oldPath.endsWith("/") ? oldPath : `${oldPath}/`;
    const renameTo = fileOrFolder.path.endsWith("/")
      ? fileOrFolder.path
      : `${fileOrFolder.path}/`;
    let ctime = 0;
    let mtime = 0;
    if (requireApiVersion(API_VER_STAT_FOLDER)) {
      // TAbstractFile does not contain these info
      // but from API_VER_STAT_FOLDER we can manually stat them by path.
      const s = await statFix(fileOrFolder.vault, fileOrFolder.path);
      if (s !== undefined && s !== null) {
        ctime = s.ctime;
        mtime = s.mtime;
      }
    }
    k1 = {
      key: key,
      ctime: ctime,
      mtime: mtime,
      size: 0,
      actionWhen: actionWhen,
      actionType: "rename",
      keyType: "folder",
      renameTo: renameTo,
      vaultRandomID: vaultRandomID,
    };
    k2 = {
      key: renameTo,
      ctime: ctime,
      mtime: mtime,
      size: 0,
      actionWhen: actionWhen,
      actionType: "renameDestination",
      keyType: "folder",
      renameTo: "", // itself is the destination, so no need to set this field
      vaultRandomID: vaultRandomID,
    };
  }
  await Promise.all([
    db.fileHistoryTbl.setItem(`${vaultRandomID}\t${k1!.key}`, k1),
    db.fileHistoryTbl.setItem(`${vaultRandomID}\t${k2!.key}`, k2),
  ]);
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
    tsFmt: syncPlan.tsFmt,
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

/**
 * We remove records that are older than 3 days or 100 records.
 * It's a heavy operation, so we shall not place it in the start up.
 * @param db
 */
export const clearExpiredSyncPlanRecords = async (db: InternalDBs) => {
  const MILLISECONDS_OLD = 1000 * 60 * 60 * 24 * 3; // 3 days
  const COUNT_TO_MANY = 100;

  const currTs = Date.now();
  const expiredTs = currTs - MILLISECONDS_OLD;

  let records = (await db.syncPlansTbl.keys()).map((key) => {
    const ts = parseInt(key.split("\t")[1]);
    const expired = ts <= expiredTs;
    return {
      ts: ts,
      key: key,
      expired: expired,
    };
  });

  const keysToRemove = new Set(
    records.filter((x) => x.expired).map((x) => x.key)
  );

  if (records.length - keysToRemove.size > COUNT_TO_MANY) {
    // we need to find out records beyond 100 records
    records = records.filter((x) => !x.expired); // shrink the array
    records.sort((a, b) => -(a.ts - b.ts)); // descending
    records.slice(COUNT_TO_MANY).forEach((element) => {
      keysToRemove.add(element.key);
    });
  }

  const ps = [] as Promise<void>[];
  keysToRemove.forEach((element) => {
    ps.push(db.syncPlansTbl.removeItem(element));
  });
  await Promise.all(ps);
};

export const clearAllLoggerOutputRecords = async (db: InternalDBs) => {
  await db.loggerOutputTbl.clear();
  log.debug(`successfully clearAllLoggerOutputRecords`);
};

export const upsertLastSuccessSyncByVault = async (
  db: InternalDBs,
  vaultRandomID: string,
  millis: number
) => {
  await db.simpleKVForMiscTbl.setItem(
    `${vaultRandomID}-lastSuccessSyncMillis`,
    millis
  );
};

export const getLastSuccessSyncByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  return (await db.simpleKVForMiscTbl.getItem(
    `${vaultRandomID}-lastSuccessSyncMillis`
  )) as number;
};

export const upsertPluginVersionByVault = async (
  db: InternalDBs,
  vaultRandomID: string,
  newVersion: string
) => {
  let oldVersion: string | null = await db.simpleKVForMiscTbl.getItem(
    `${vaultRandomID}-pluginversion`
  );
  if (oldVersion === null) {
    oldVersion = "0.0.0";
  }
  await db.simpleKVForMiscTbl.setItem(
    `${vaultRandomID}-pluginversion`,
    newVersion
  );

  return {
    oldVersion: oldVersion,
    newVersion: newVersion,
  };
};
