import type { Entity } from "../../src/baseTypes";
import type { InternalDBs } from "../../src/localdb";

export const upsertFileContentHistoryByVaultAndProfile = async (
  db: InternalDBs,
  vaultRandomID: string,
  profileID: string,
  prevSync: Entity,
  prevContent: ArrayBuffer
) => {
  await db.fileContentHistoryTbl.setItem(
    `${vaultRandomID}\t${profileID}\t${prevSync.key}`,
    prevContent
  );
};

export const getFileContentHistoryByVaultAndProfile = async (
  db: InternalDBs,
  vaultRandomID: string,
  profileID: string,
  prevSync: Entity
) => {
  return (await db.fileContentHistoryTbl.getItem(
    `${vaultRandomID}\t${profileID}\t${prevSync.key}`
  )) as ArrayBuffer | null | undefined;
};

export const clearFileContentHistoryByVaultAndProfile = async (
  db: InternalDBs,
  vaultRandomID: string,
  profileID: string,
  key: string
) => {
  await db.fileContentHistoryTbl.removeItem(
    `${vaultRandomID}\t${profileID}\t${key}`
  );
};

export const clearAllFileContentHistoryByVault = async (
  db: InternalDBs,
  vaultRandomID: string
) => {
  const keys = (await db.fileContentHistoryTbl.keys()).filter((x) =>
    x.startsWith(`${vaultRandomID}\t`)
  );
  await db.fileContentHistoryTbl.removeItems(keys);
};
