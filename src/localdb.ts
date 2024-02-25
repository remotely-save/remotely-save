import localforage from "localforage";
export type LocalForage = typeof localforage;
import { nanoid } from "nanoid";
import { requireApiVersion, TAbstractFile, TFile, TFolder } from "obsidian";

import { API_VER_STAT_FOLDER } from "./baseTypes";
import type { Entity, MixedEntity, SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import type { SyncPlanType } from "./sync";
import { statFix, toText, unixTimeToStr } from "./misc";

import { log } from "./moreOnLog";

const DB_VERSION_NUMBER_IN_HISTORY = [20211114, 20220108, 20220326, 20240220];
export const DEFAULT_DB_VERSION_NUMBER: number = 20240220;
export const DEFAULT_DB_NAME = "remotelysavedb";
export const DEFAULT_TBL_VERSION = "schemaversion";
export const DEFAULT_SYNC_PLANS_HISTORY = "syncplanshistory";
export const DEFAULT_TBL_VAULT_RANDOM_ID_MAPPING = "vaultrandomidmapping";
export const DEFAULT_TBL_LOGGER_OUTPUT = "loggeroutput";
export const DEFAULT_TBL_SIMPLE_KV_FOR_MISC = "simplekvformisc";
export const DEFAULT_TBL_PREV_SYNC_RECORDS = "prevsyncrecords";

/**
 * @deprecated
 */
export const DEFAULT_TBL_FILE_HISTORY = "filefolderoperationhistory";
/**
 * @deprecated
 */
export const DEFAULT_TBL_SYNC_MAPPING = "syncmetadatahistory";

/**
 * @deprecated
 * But we cannot remove it. Because we want to migrate the old data.
 */
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
  syncPlansTbl: LocalForage;
  vaultRandomIDMappingTbl: LocalForage;
  loggerOutputTbl: LocalForage;
  simpleKVForMiscTbl: LocalForage;
  prevSyncRecordsTbl: LocalForage;

  /**
   * @deprecated
   * But we cannot remove it. Because we want to migrate the old data.
   */
  fileHistoryTbl: LocalForage;

  /**
   * @deprecated
   * But we cannot remove it. Because we want to migrate the old data.
   */
  syncMappingTbl: LocalForage;
}

/**
 * TODO
 * @param syncMappings
 * @returns
 */
const fromSyncMappingsToPrevSyncRecords = (
  oldSyncMappings: SyncMetaMappingRecord[]
): Entity[] => {
  const res: Entity[] = [];
  for (const oldMapping of oldSyncMappings) {
    const newEntity: Entity = {
      key: oldMapping.localKey,
      keyEnc: oldMapping.remoteKey,
      keyRaw:
        oldMapping.remoteKey !== undefined && oldMapping.remoteKey !== ""
          ? oldMapping.remoteKey
          : oldMapping.localKey,
      mtimeCli: oldMapping.localMtime,
      mtimeSvr: oldMapping.remoteMtime,
      size: oldMapping.localSize,
      sizeEnc: oldMapping.remoteSize,
      sizeRaw:
        oldMapping.remoteKey !== undefined && oldMapping.remoteKey !== ""
          ? oldMapping.remoteSize
          : oldMapping.localSize,
      etag: oldMapping.remoteExtraKey,
    };

    res.push(newEntity);
  }
  return res;
};

/**
 *
 * @param db
 * @param vaultRandomID
 * Migrate the sync mapping record to sync Entity.
 */
const migrateDBsFrom20220326To20240220 = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const oldVer = 20220326;
  const newVer = 20240220;
  log.debug(`start upgrading internal db from ${oldVer} to ${newVer}`);

  // from sync mapping to prev sync
  const syncMappings = await getAllSyncMetaMappingByVault(db, vaultRandomID);
  const prevSyncRecords = fromSyncMappingsToPrevSyncRecords(syncMappings);
  for (const prevSyncRecord of prevSyncRecords) {
    await upsertPrevSyncRecordByVault(db, vaultRandomID, prevSyncRecord);
  }

  // // clear not used data
  // // as of 20240220, we don't call them,
  // // for the opportunity for users to downgrade
  // await clearFileHistoryOfEverythingByVault(db, vaultRandomID);
  // await clearAllSyncMetaMappingByVault(db, vaultRandomID);

  await db.versionTbl.setItem(`${vaultRandomID}\tversion`, newVer);
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

  // as of 20240220, we assume everyone is using 20220326 already
  // drop any old code to reduce the verbose
  if (oldVer < 20220326) {
    throw Error(
      "You are using a very old version of Remotely Save. No way to auto update internal DB. Please install and enable 0.3.40 firstly, then install a later version."
    );
  }

  if (oldVer === 20220326 && newVer === 20240220) {
    return await migrateDBsFrom20220326To20240220(db, vaultRandomID);
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
    prevSyncRecordsTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_PREV_SYNC_RECORDS,
    }),

    fileHistoryTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_FILE_HISTORY,
    }),
    syncMappingTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_SYNC_MAPPING,
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

  // as of 20240220, we set the version per vault, instead of global "version"
  const originalVersion: number | null =
    (await db.versionTbl.getItem(`${vaultRandomID}\tversion`)) ??
    (await db.versionTbl.getItem("version"));
  if (originalVersion === null) {
    log.debug(
      `no internal db version, setting it to ${DEFAULT_DB_VERSION_NUMBER}`
    );
    // as of 20240220, we set the version per vault, instead of global "version"
    await db.versionTbl.setItem(
      `${vaultRandomID}\tversion`,
      DEFAULT_DB_VERSION_NUMBER
    );
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

export const clearFileHistoryOfEverythingByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const keys = await db.fileHistoryTbl.keys();
  for (const key of keys) {
    if (key.startsWith(`${vaultRandomID}\t`)) {
      await db.fileHistoryTbl.removeItem(key);
    }
  }
};

/**
 * @deprecated But we cannot remove it. Because we want to migrate the old data.
 * @param db
 * @param vaultRandomID
 * @returns
 */
export const getAllSyncMetaMappingByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  return await Promise.all(
    ((await db.syncMappingTbl.keys()) ?? [])
      .filter((key) => key.startsWith(`${vaultRandomID}\t`))
      .map(
        async (key) =>
          (await db.syncMappingTbl.getItem(key)) as SyncMetaMappingRecord
      )
  );
};

export const clearAllSyncMetaMappingByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const keys = await db.syncMappingTbl.keys();
  for (const key of keys) {
    if (key.startsWith(`${vaultRandomID}\t`)) {
      await db.syncMappingTbl.removeItem(key);
    }
  }
};

export const insertSyncPlanRecordByVault = async (
  db: InternalDBs,
  syncPlan: SyncPlanType,
  vaultRandomID: string,
  remoteType: SUPPORTED_SERVICES_TYPE
) => {
  const now = Date.now();
  const record = {
    ts: now,
    tsFmt: unixTimeToStr(now),
    vaultRandomID: vaultRandomID,
    remoteType: remoteType,
    syncPlan: JSON.stringify(syncPlan /* directly stringify */, null, 2),
  } as SyncPlanRecord;
  await db.syncPlansTbl.setItem(`${vaultRandomID}\t${now}`, record);
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

export const getAllPrevSyncRecordsByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  // log.debug('inside getAllPrevSyncRecordsByVault')
  const keys = await db.prevSyncRecordsTbl.keys();
  // log.debug(`inside getAllPrevSyncRecordsByVault, keys=${keys}`)
  const res: Entity[] = [];
  for (const key of keys) {
    if (key.startsWith(`${vaultRandomID}\t`)) {
      const val: Entity | null = await db.prevSyncRecordsTbl.getItem(key);
      if (val !== null) {
        res.push(val);
      }
    }
  }
  return res;
};

export const upsertPrevSyncRecordByVault = async (
  db: InternalDBs,
  vaultRandomID: string,
  prevSync: Entity
) => {
  await db.prevSyncRecordsTbl.setItem(
    `${vaultRandomID}\t${prevSync.key}`,
    prevSync
  );
};

export const clearPrevSyncRecordByVault = async (
  db: InternalDBs,
  vaultRandomID: string,
  key: string
) => {
  await db.prevSyncRecordsTbl.removeItem(`${vaultRandomID}\t${key}`);
};

export const clearAllPrevSyncRecordByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const keys = await db.prevSyncRecordsTbl.keys();
  for (const key of keys) {
    if (key.startsWith(`${vaultRandomID}\t`)) {
      await db.prevSyncRecordsTbl.removeItem(key);
    }
  }
};

export const clearAllLoggerOutputRecords = async (db: InternalDBs) => {
  await db.loggerOutputTbl.clear();
  log.debug(`successfully clearAllLoggerOutputRecords`);
};

export const upsertLastSuccessSyncTimeByVault = async (
  db: InternalDBs,
  vaultRandomID: string,
  millis: number
) => {
  await db.simpleKVForMiscTbl.setItem(
    `${vaultRandomID}-lastSuccessSyncMillis`,
    millis
  );
};

export const getLastSuccessSyncTimeByVault = async (
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
