import type { Vault } from "obsidian";

import {
  DEFAULT_DEBUG_FOLDER,
  DEFAULT_PROFILER_RESULT_FILE_PREFIX,
  DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX,
} from "./baseTypes";
import {
  readAllProfilerResultsByVault,
  readAllSyncPlanRecordTextsByVault,
} from "./localdb";
import type { InternalDBs } from "./localdb";
import { mkdirpInVault } from "./misc";

export const exportVaultSyncPlansToFiles = async (
  db: InternalDBs,
  vault: Vault,
  vaultRandomID: string,
  howMany: number
) => {
  console.info("exporting sync plans");
  await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault);
  const records = await readAllSyncPlanRecordTextsByVault(db, vaultRandomID);
  let md = "";
  if (records.length === 0) {
    md = "No sync plans history found";
  } else {
    if (howMany <= 0) {
      md =
        "Sync plans found:\n\n" +
        records.map((x) => "```json\n" + x + "\n```\n").join("\n");
    } else {
      md =
        "Sync plans found:\n\n" +
        records
          .map((x) => "```json\n" + x + "\n```\n")
          .slice(0, howMany)
          .join("\n");
    }
  }
  const ts = Date.now();
  const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX}${ts}.md`;
  await vault.create(filePath, md, {
    mtime: ts,
  });
  console.info("finish exporting sync plans");
};

export const exportVaultProfilerResultsToFiles = async (
  db: InternalDBs,
  vault: Vault,
  vaultRandomID: string
) => {
  console.info("exporting profiler results");
  await mkdirpInVault(DEFAULT_DEBUG_FOLDER, vault);
  const records = await readAllProfilerResultsByVault(db, vaultRandomID);
  let md = "";
  if (records.length === 0) {
    md = "No profiler results found";
  } else {
    md =
      "Profiler results found:\n\n" +
      records.map((x) => "```\n" + x + "\n```\n").join("\n");
  }
  const ts = Date.now();
  const filePath = `${DEFAULT_DEBUG_FOLDER}${DEFAULT_PROFILER_RESULT_FILE_PREFIX}${ts}.md`;
  await vault.create(filePath, md, {
    mtime: ts,
  });
  console.info("finish exporting profiler results");
};
