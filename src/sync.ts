import { TAbstractFile, TFolder, TFile, Vault } from "obsidian";
import { S3Client } from "@aws-sdk/client-s3";
import * as lf from "lovefield-ts/dist/es6/lf.js";

import { clearHistoryOfKey, FileFolderHistoryRecord } from "./localdb";
import { S3Config, S3ObjectType, uploadToRemote, deleteFromRemote } from "./s3";
import { downloadFromRemote } from "./s3";
import { mkdirpInVault } from "./misc";

type DecisionType =
  | "undecided"
  | "unknown"
  | "upload_clearhist"
  | "download_clearhist"
  | "delremote_clearhist"
  | "download"
  | "upload"
  | "clearhist"
  | "mkdirplocal"
  | "skip";

export type SyncStatusType = "idle" | "preparing" | "syncing";

interface FileOrFolderMixedState {
  key: string;
  exist_local?: boolean;
  exist_remote?: boolean;
  mtime_local?: number;
  mtime_remote?: number;
  delete_time_local?: number;
  size_local?: number;
  size_remote?: number;
  decision?: DecisionType;
  syncDone?: "done";
}

export const ensembleMixedStates = (
  remote: S3ObjectType[],
  local: TAbstractFile[],
  deleteHistory: FileFolderHistoryRecord[]
) => {
  const results = {} as Record<string, FileOrFolderMixedState>;

  remote.forEach((entry) => {
    let r = {} as FileOrFolderMixedState;
    const key = entry.Key;
    r = {
      key: key,
      exist_remote: true,
      mtime_remote: entry.LastModified.valueOf(),
      size_remote: entry.Size,
    };
    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].exist_remote = r.exist_remote;
      results[key].mtime_remote = r.mtime_remote;
      results[key].size_remote = r.size_remote;
    } else {
      results[key] = r;
    }
  });

  local.forEach((entry) => {
    let r = {} as FileOrFolderMixedState;
    let key = entry.path;

    if (entry.path === "/") {
      // ignore
      return;
    } else if (entry instanceof TFile) {
      r = {
        key: entry.path,
        exist_local: true,
        mtime_local: entry.stat.mtime,
        size_local: entry.stat.size,
      };
    } else if (entry instanceof TFolder) {
      key = `${entry.path}/`;
      r = {
        key: key,
        exist_local: true,
        mtime_local: undefined,
        size_local: 0,
      };
    } else {
      throw Error(`unexpected ${entry}`);
    }

    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].exist_local = r.exist_local;
      results[key].mtime_local = r.mtime_local;
      results[key].size_local = r.size_local;
    } else {
      results[key] = r;
    }
  });

  deleteHistory.forEach((entry) => {
    let key = entry.key;
    if (entry.key_type === "folder") {
      if (!entry.key.endsWith("/")) {
        key = `${entry.key}/`;
      }
    } else if (entry.key_type === "file") {
      // pass
    } else {
      throw Error(`unexpected ${entry}`);
    }

    const r = {
      key: key,
      delete_time_local: entry.action_when,
    } as FileOrFolderMixedState;

    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].delete_time_local = r.delete_time_local;
    } else {
      results[key] = r;
    }
  });

  return results;
};

export const getOperation = (
  origRecord: FileOrFolderMixedState,
  inplace: boolean = false
) => {
  let r = origRecord;
  if (!inplace) {
    r = Object.assign({}, origRecord);
  }

  if (r.mtime_local === 0) {
    r.mtime_local = undefined;
  }
  if (r.mtime_remote === 0) {
    r.mtime_remote = undefined;
  }
  if (r.delete_time_local === 0) {
    r.delete_time_local = undefined;
  }
  if (r.exist_local === undefined) {
    r.exist_local = false;
  }
  if (r.exist_remote === undefined) {
    r.exist_remote = false;
  }
  r.decision = "unknown";

  if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote > r.mtime_local
  ) {
    r.decision = "download_clearhist";
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote < r.mtime_local
  ) {
    r.decision = "upload_clearhist";
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote === r.mtime_local &&
    r.size_local === r.size_remote
  ) {
    r.decision = "skip";
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote === r.mtime_local &&
    r.size_local === r.size_remote
  ) {
    r.decision = "upload_clearhist";
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local === undefined
  ) {
    // this must be a folder!
    if (!r.key.endsWith("/")) {
      throw Error(`${r.key} is not a folder but lacks local mtime`);
    }
    r.decision = "skip";
  } else if (
    r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local === undefined &&
    r.delete_time_local !== undefined &&
    r.mtime_remote >= r.delete_time_local
  ) {
    r.decision = "download_clearhist";
  } else if (
    r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local === undefined &&
    r.delete_time_local !== undefined &&
    r.mtime_remote < r.delete_time_local
  ) {
    r.decision = "delremote_clearhist";
  } else if (
    r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local === undefined &&
    r.delete_time_local == undefined
  ) {
    r.decision = "download";
  } else if (!r.exist_remote && r.exist_local && r.mtime_remote === undefined) {
    r.decision = "upload_clearhist";
  } else if (
    !r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote === undefined &&
    r.mtime_local === undefined
  ) {
    r.decision = "clearhist";
  }

  return r;
};

export const doActualSync = async (
  s3Client: S3Client,
  s3Config: S3Config,
  db: lf.DatabaseConnection,
  vault: Vault,
  keyStates: Record<string, FileOrFolderMixedState>
) => {
  Object.entries(keyStates)
    .sort((k, v) => -(k as string).length)
    .map(async ([k, v]) => {
      const key = k as string;
      const state = v as FileOrFolderMixedState;

      if (
        state.decision === undefined ||
        state.decision === "unknown" ||
        state.decision === "undecided"
      ) {
        throw Error(`unknown decision in ${JSON.stringify(state)}`);
      } else if (state.decision === "skip") {
        // do nothing
      } else if (state.decision === "download_clearhist") {
        await downloadFromRemote(
          s3Client,
          s3Config,
          state.key,
          vault,
          state.mtime_remote
        );
        await clearHistoryOfKey(db, state.key);
      } else if (state.decision === "upload_clearhist") {
        await uploadToRemote(s3Client, s3Config, state.key, vault, false);
        await clearHistoryOfKey(db, state.key);
      } else if (state.decision === "download") {
        await mkdirpInVault(state.key, vault);
        await downloadFromRemote(
          s3Client,
          s3Config,
          state.key,
          vault,
          state.mtime_remote
        );
      } else if (state.decision === "delremote_clearhist") {
        await deleteFromRemote(s3Client, s3Config, state.key);
        await clearHistoryOfKey(db, state.key);
      } else if (state.decision === "upload") {
        await uploadToRemote(s3Client, s3Config, state.key, vault, false);
      } else if (state.decision === "clearhist") {
        await clearHistoryOfKey(db, state.key);
      } else {
        throw Error("this should never happen!");
      }
    });
};
