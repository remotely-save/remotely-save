import { TAbstractFile, TFolder, TFile, Vault } from "obsidian";

import type { SyncPlanType } from "./sync";
import {
  readAllSyncPlanRecordTextsByVault,
  readAllLogRecordTextsByVault,
} from "./localdb";
import type { InternalDBs } from "./localdb";
import { mkdirpInVault } from "./misc";
import {
  DEFAULT_DEBUG_FOLDER,
  DEFAULT_LOG_HISTORY_FILE_PREFIX,
  DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX,
} from "./baseTypes";

import { log } from "./moreOnLog";

export const exportVaultSyncPlansToFiles = async (
  db: InternalDBs,
  vault: Vault,
  vaultRandomID: string
) => {
  log.info("exporting");
  await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault);
  const records = await readAllSyncPlanRecordTextsByVault(db, vaultRandomID);
  let md = "";
  if (records.length === 0) {
    md = "No sync plans history found";
  } else {
    md =
      "Sync plans found:\n\n" +
      records.map((x) => "```json\n" + x + "\n```\n").join("\n");
  }
  const ts = Date.now();
  const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX}${ts}.md`;
  await vault.create(filePath, md, {
    mtime: ts,
  });
  log.info("finish exporting");
};

export const exportVaultLoggerOutputToFiles = async (
  db: InternalDBs,
  vault: Vault,
  vaultRandomID: string
) => {
  await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault);
  const records = await readAllLogRecordTextsByVault(db, vaultRandomID);
  let md = "";
  if (records.length === 0) {
    md = "No logger history found.";
  } else {
    md =
      "Logger history found:\n\n" +
      "```text\n" +
      records.join("\n") +
      "\n```\n";
  }
  const ts = Date.now();
  const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_LOG_HISTORY_FILE_PREFIX}${ts}.md`;
  await vault.create(filePath, md, {
    mtime: ts,
  });
};
