import { TAbstractFile, TFolder, TFile, Vault } from "obsidian";

import type { SyncPlanType } from "./sync";
import { readAllSyncPlanRecordTexts } from "./localdb";
import type { InternalDBs } from "./localdb";
import { mkdirpInVault } from "./misc";

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

const DEFAULT_DEBUG_FOLDER = "_debug_remotely_save/";
const DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX = "sync_plans_hist_exported_on_";

export const exportSyncPlansToFiles = async (db: InternalDBs, vault: Vault) => {
  log.info("exporting");
  await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault);
  const records = await readAllSyncPlanRecordTexts(db);
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
