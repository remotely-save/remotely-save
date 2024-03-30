import { TAbstractFile, TFolder, TFile, Vault } from "obsidian";

import type { SyncPlanType } from "./sync";
import { readAllSyncPlanRecordTextsByVault } from "./localdb";
import type { InternalDBs } from "./localdb";
import { mkdirpInVault } from "./misc";
import {
  DEFAULT_DEBUG_FOLDER,
  DEFAULT_LOG_HISTORY_FILE_PREFIX,
  DEFAULT_SYNC_PLANS_HISTORY_FILE_PREFIX,
  FileOrFolderMixedState,
} from "./baseTypes";

const turnSyncPlanToTable = (record: string) => {
  const syncPlan: SyncPlanType = JSON.parse(record);
  const { ts, tsFmt, remoteType, mixedStates } = syncPlan;

  type allowedHeadersType = keyof FileOrFolderMixedState;
  const headers: allowedHeadersType[] = [
    "key",
    "remoteEncryptedKey",
    "existLocal",
    "sizeLocal",
    "sizeLocalEnc",
    "mtimeLocal",
    "deltimeLocal",
    "changeLocalMtimeUsingMapping",
    "existRemote",
    "sizeRemote",
    "sizeRemoteEnc",
    "mtimeRemote",
    "deltimeRemote",
    "changeRemoteMtimeUsingMapping",
    "decision",
    "decisionBranch",
  ];

  const lines = [
    `ts: ${ts}${tsFmt !== undefined ? " / " + tsFmt : ""}`,
    `remoteType: ${remoteType}`,
    `| ${headers.join(" | ")} |`,
    `| ${headers.map((x) => "---").join(" | ")} |`,
  ];
  for (const [k1, v1] of Object.entries(syncPlan.mixedStates)) {
    const k = k1 as string;
    const v = v1 as FileOrFolderMixedState;
    const singleLine = [];
    for (const h of headers) {
      const field = v[h];
      if (field === undefined) {
        singleLine.push("");
        continue;
      }
      if (
        h === "mtimeLocal" ||
        h === "deltimeLocal" ||
        h === "mtimeRemote" ||
        h === "deltimeRemote"
      ) {
        const fmt = v[(h + "Fmt") as allowedHeadersType] as string;
        const s = `${field}${fmt !== undefined ? " / " + fmt : ""}`;
        singleLine.push(s);
      } else {
        singleLine.push(field);
      }
    }
    lines.push(`| ${singleLine.join(" | ")} |`);
  }

  return lines.join("\n");
};

export const exportVaultSyncPlansToFiles = async (
  db: InternalDBs,
  vault: Vault,
  vaultRandomID: string
) => {
  console.info("exporting");
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
  console.info("finish exporting");
};
