import localforage from "localforage";
import { extendPrototype as ep1 } from "localforage-getitems";
import { extendPrototype as ep2 } from "localforage-removeitems";
ep1(localforage);
ep2(localforage);
export type LocalForage = typeof localforage;
import { nanoid } from "nanoid";

import type { Entity, SUPPORTED_SERVICES_TYPE } from "./baseTypes";
import { unixTimeToStr } from "./misc";
import type { SyncPlanType } from "./sync";

const DB_VERSION_NUMBER_IN_HISTORY = [20211114, 20220108, 20220326, 20240220];
export const DEFAULT_DB_VERSION_NUMBER: number = 20240220;
export const DEFAULT_DB_NAME = "remotelysavedb";
export const DEFAULT_TBL_VERSION = "schemaversion";
export const DEFAULT_SYNC_PLANS_HISTORY = "syncplanshistory";
export const DEFAULT_TBL_VAULT_RANDOM_ID_MAPPING = "vaultrandomidmapping";
export const DEFAULT_TBL_LOGGER_OUTPUT = "loggeroutput";
export const DEFAULT_TBL_SIMPLE_KV_FOR_MISC = "simplekvformisc";
export const DEFAULT_TBL_PREV_SYNC_RECORDS = "prevsyncrecords";
export const DEFAULT_TBL_PROFILER_RESULTS = "profilerresults";

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
  profilerResultsTbl: LocalForage;

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
  vaultRandomID: string,
  profileID: string
) => {
  const oldVer = 20220326;
  const newVer = 20240220;
  console.debug(`start upgrading internal db from ${oldVer} to ${newVer}`);

  // from sync mapping to prev sync
  const syncMappings = await getAllSyncMetaMappingByVault(db, vaultRandomID);
  const prevSyncRecords = fromSyncMappingsToPrevSyncRecords(syncMappings);
  for (const prevSyncRecord of prevSyncRecords) {
    await upsertPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      prevSyncRecord
    );
  }

  // // clear not used data
  // // as of 20240220, we don't call them,
  // // for the opportunity for users to downgrade
  // await clearFileHistoryOfEverythingByVault(db, vaultRandomID);
  // await clearAllSyncMetaMappingByVault(db, vaultRandomID);

  await db.versionTbl.setItem(`${vaultRandomID}\tversion`, newVer);
  console.debug(`finish upgrading internal db from ${oldVer} to ${newVer}`);
};

const migrateDBs = async (
  db: InternalDBs,
  oldVer: number,
  newVer: number,
  vaultRandomID: string,
  profileID: string
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
    return await migrateDBsFrom20220326To20240220(db, vaultRandomID, profileID);
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
  vaultRandomIDFromOldConfigFile: string,
  profileID: string
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
    profilerResultsTbl: localforage.createInstance({
      name: DEFAULT_DB_NAME,
      storeName: DEFAULT_TBL_PROFILER_RESULTS,
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
    console.debug(
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
    console.debug(
      `trying to upgrade db version from ${originalVersion} to ${DEFAULT_DB_VERSION_NUMBER}`
    );
    await migrateDBs(
      db,
      originalVersion,
      DEFAULT_DB_VERSION_NUMBER,
      vaultRandomID,
      profileID
    );
  }

  console.info("db connected");
  return {
    db: db,
    vaultRandomID: vaultRandomID,
  };
};

export const destroyDBs = async () => {
  // await localforage.dropInstance({
  //   name: DEFAULT_DB_NAME,
  // });
  // console.info("db deleted");
  const req = indexedDB.deleteDatabase(DEFAULT_DB_NAME);
  req.onsuccess = (event) => {
    console.info("db deleted");
  };
  req.onblocked = (event) => {
    console.warn("trying to delete db but it was blocked");
  };
  req.onerror = (event) => {
    console.error("tried to delete db but something goes wrong!");
    console.error(event);
  };
};

export const clearFileHistoryOfEverythingByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const keys = (await db.fileHistoryTbl.keys()).filter((x) =>
    x.startsWith(`${vaultRandomID}\t`)
  );
  await db.fileHistoryTbl.removeItems(keys);
  // for (const key of keys) {
  //   if (key.startsWith(`${vaultRandomID}\t`)) {
  //     await db.fileHistoryTbl.removeItem(key);
  //   }
  // }
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
  const keys = (await db.syncMappingTbl.keys()).filter((x) =>
    x.startsWith(`${vaultRandomID}\t`)
  );
  await db.syncMappingTbl.removeItems(keys);
  // for (const key of keys) {
  //   if (key.startsWith(`${vaultRandomID}\t`)) {
  //     await db.syncMappingTbl.removeItem(key);
  //   }
  // }
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
 * We remove records that are older than 1 days or 20 records.
 * It's a heavy operation, so we shall not place it in the start up.
 * @param db
 */
export const clearExpiredSyncPlanRecords = async (db: InternalDBs) => {
  const MILLISECONDS_OLD = 1000 * 60 * 60 * 24 * 1; // 1 days
  const COUNT_TO_MANY = 20;

  const currTs = Date.now();
  const expiredTs = currTs - MILLISECONDS_OLD;

  let records = (await db.syncPlansTbl.keys()).map((key) => {
    const ts = Number.parseInt(key.split("\t")[1]);
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

  // const ps = [] as Promise<void>[];
  // keysToRemove.forEach((element) => {
  //   ps.push(db.syncPlansTbl.removeItem(element));
  // });
  // await Promise.all(ps);
  await db.syncPlansTbl.removeItems(Array.from(keysToRemove));
};

export const getAllPrevSyncRecordsByVaultAndProfile = async (
  db: InternalDBs,
  vaultRandomID: string,
  profileID: string
) => {
  const res: Entity[] = [];
  const kv: Record<string, Entity | null> =
    await db.prevSyncRecordsTbl.getItems();
  for (const key of Object.getOwnPropertyNames(kv)) {
    if (key.startsWith(`${vaultRandomID}\t${profileID}\t`)) {
      const val = kv[key];
      if (val !== null) {
        res.push(val);
      }
    }
  }
  return res;
};

export const upsertPrevSyncRecordByVaultAndProfile = async (
  db: InternalDBs,
  vaultRandomID: string,
  profileID: string,
  prevSync: Entity
) => {
  await db.prevSyncRecordsTbl.setItem(
    `${vaultRandomID}\t${profileID}\t${prevSync.key}`,
    prevSync
  );
};

export const clearPrevSyncRecordByVaultAndProfile = async (
  db: InternalDBs,
  vaultRandomID: string,
  profileID: string,
  key: string
) => {
  await db.prevSyncRecordsTbl.removeItem(
    `${vaultRandomID}\t${profileID}\t${key}`
  );
};

export const clearAllPrevSyncRecordByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const keys = (await db.prevSyncRecordsTbl.keys()).filter((x) =>
    x.startsWith(`${vaultRandomID}\t`)
  );
  await db.prevSyncRecordsTbl.removeItems(keys);
};

export const clearAllLoggerOutputRecords = async (db: InternalDBs) => {
  await db.loggerOutputTbl.clear();
  console.debug(`successfully clearAllLoggerOutputRecords`);
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

export const insertProfilerResultByVault = async (
  db: InternalDBs,
  profilerStr: string,
  vaultRandomID: string,
  remoteType: SUPPORTED_SERVICES_TYPE
) => {
  const now = Date.now();
  await db.profilerResultsTbl.setItem(`${vaultRandomID}\t${now}`, profilerStr);

  // clear older one while writing
  const records = (await db.profilerResultsTbl.keys())
    .filter((x) => x.startsWith(`${vaultRandomID}\t`))
    .map((x) => Number.parseInt(x.split("\t")[1]));
  records.sort((a, b) => -(a - b)); // descending
  while (records.length > 5) {
    const ts = records.pop()!;
    await db.profilerResultsTbl.removeItem(`${vaultRandomID}\t${ts}`);
  }
};

export const readAllProfilerResultsByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const records = [] as { val: string; ts: number }[];
  await db.profilerResultsTbl.iterate((value, key, iterationNumber) => {
    if (key.startsWith(`${vaultRandomID}\t`)) {
      records.push({
        val: value as string,
        ts: Number.parseInt(key.split("\t")[1]),
      });
    }
  });
  records.sort((a, b) => -(a.ts - b.ts)); // descending

  if (records === undefined) {
    return [] as string[];
  } else {
    return records.map((x) => x.val);
  }
};
