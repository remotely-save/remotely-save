import { TAbstractFile, TFolder, TFile, Vault } from "obsidian";

import { S3Client } from "@aws-sdk/client-s3";
import * as lf from "lovefield-ts/dist/es6/lf.js";

import {
  clearDeleteRenameHistoryOfKey,
  FileFolderHistoryRecord,
  upsertSyncMetaMappingDataS3,
  getSyncMetaMappingByRemoteKeyS3,
} from "./localdb";
import {
  S3Config,
  S3ObjectType,
  uploadToRemote,
  deleteFromRemote,
  downloadFromRemote,
} from "./s3";
import {
  mkdirpInVault,
  SUPPORTED_SERVICES_TYPE,
  isHiddenPath,
  isVaildText,
} from "./misc";
import {
  decryptBase32ToString,
  encryptStringToBase32,
  MAGIC_ENCRYPTED_PREFIX_BASE32,
} from "./encrypt";

export type SyncStatusType =
  | "idle"
  | "preparing"
  | "getting_remote_meta"
  | "getting_local_meta"
  | "checking_password"
  | "generating_plan"
  | "syncing"
  | "finish";

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
  decision_branch?: number;
  remote_encrypted_key?: string;
}

export interface SyncPlanType {
  ts: number;
  remoteType: SUPPORTED_SERVICES_TYPE;
  mixedStates: Record<string, FileOrFolderMixedState>;
}

export interface PasswordCheckType {
  ok: boolean;
  reason:
    | "ok"
    | "empty_remote"
    | "remote_encrypted_local_no_password"
    | "password_matched"
    | "password_not_matched"
    | "invalid_text_after_decryption"
    | "remote_not_encrypted_local_has_password"
    | "no_password_both_sides";
}

export const isPasswordOk = async (
  remote: S3ObjectType[],
  password: string = ""
) => {
  if (remote === undefined || remote.length === 0) {
    // remote empty
    return {
      ok: true,
      reason: "empty_remote",
    } as PasswordCheckType;
  }
  const santyCheckKey = remote[0].Key;
  if (santyCheckKey.startsWith(MAGIC_ENCRYPTED_PREFIX_BASE32)) {
    // this is encrypted!
    // try to decrypt it using the provided password.
    if (password === "") {
      return {
        ok: false,
        reason: "remote_encrypted_local_no_password",
      } as PasswordCheckType;
    }
    try {
      const res = await decryptBase32ToString(santyCheckKey, password);

      // additional test
      // because iOS Safari bypasses decryption with wrong password!
      if (isVaildText(res)) {
        return {
          ok: true,
          reason: "password_matched",
        } as PasswordCheckType;
      } else {
        return {
          ok: false,
          reason: "invalid_text_after_decryption",
        } as PasswordCheckType;
      }
    } catch (error) {
      return {
        ok: false,
        reason: "password_not_matched",
      } as PasswordCheckType;
    }
  } else {
    // it is not encrypted!
    if (password !== "") {
      return {
        ok: false,
        reason: "remote_not_encrypted_local_has_password",
      } as PasswordCheckType;
    }
    return {
      ok: true,
      reason: "no_password_both_sides",
    } as PasswordCheckType;
  }
};

const ensembleMixedStates = async (
  remote: S3ObjectType[],
  local: TAbstractFile[],
  deleteHistory: FileFolderHistoryRecord[],
  db: lf.DatabaseConnection,
  password: string = ""
) => {
  const results = {} as Record<string, FileOrFolderMixedState>;

  if (remote !== undefined) {
    for (const entry of remote) {
      const remoteEncryptedKey = entry.Key;
      let key = remoteEncryptedKey;
      if (password !== "") {
        key = await decryptBase32ToString(remoteEncryptedKey, password);
      }
      const backwardMapping = await getSyncMetaMappingByRemoteKeyS3(
        db,
        key,
        entry.LastModified.valueOf(),
        entry.ETag
      );

      let r = {} as FileOrFolderMixedState;
      if (backwardMapping !== undefined) {
        key = backwardMapping.local_key;
        r = {
          key: key,
          exist_remote: true,
          mtime_remote: backwardMapping.local_mtime,
          size_remote: backwardMapping.local_size,
          remote_encrypted_key: remoteEncryptedKey,
        };
      } else {
        r = {
          key: key,
          exist_remote: true,
          mtime_remote: entry.LastModified.valueOf(),
          size_remote: entry.Size,
          remote_encrypted_key: remoteEncryptedKey,
        };
      }
      if (isHiddenPath(key)) {
        continue;
      }
      if (results.hasOwnProperty(key)) {
        results[key].key = r.key;
        results[key].exist_remote = r.exist_remote;
        results[key].mtime_remote = r.mtime_remote;
        results[key].size_remote = r.size_remote;
        results[key].remote_encrypted_key = r.remote_encrypted_key;
      } else {
        results[key] = r;
      }
    }
  }

  for (const entry of local) {
    let r = {} as FileOrFolderMixedState;
    let key = entry.path;

    if (entry.path === "/") {
      // ignore
      continue;
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

    if (isHiddenPath(key)) {
      continue;
    }
    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].exist_local = r.exist_local;
      results[key].mtime_local = r.mtime_local;
      results[key].size_local = r.size_local;
    } else {
      results[key] = r;
    }
  }

  for (const entry of deleteHistory) {
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

    if (isHiddenPath(key)) {
      continue;
    }
    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].delete_time_local = r.delete_time_local;
    } else {
      results[key] = r;
    }
  }

  return results;
};

const getOperation = (
  origRecord: FileOrFolderMixedState,
  inplace: boolean = false,
  password: string = ""
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
    r.decision_branch = 1;
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote < r.mtime_local
  ) {
    r.decision = "upload_clearhist";
    r.decision_branch = 2;
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote === r.mtime_local &&
    password === "" &&
    r.size_local === r.size_remote
  ) {
    r.decision = "skip";
    r.decision_branch = 3;
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote === r.mtime_local &&
    password === "" &&
    r.size_local !== r.size_remote
  ) {
    r.decision = "upload_clearhist";
    r.decision_branch = 4;
  } else if (
    r.exist_remote &&
    r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local !== undefined &&
    r.mtime_remote === r.mtime_local &&
    password !== ""
  ) {
    // if we have encryption,
    // the size is always unequal
    // only mtime(s) are reliable
    r.decision = "skip";
    r.decision_branch = 5;
  } else if (r.exist_remote && r.exist_local && r.mtime_local === undefined) {
    // this must be a folder!
    if (!r.key.endsWith("/")) {
      throw Error(`${r.key} is not a folder but lacks local mtime`);
    }
    r.decision = "skip";
    r.decision_branch = 6;
  } else if (
    r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local === undefined &&
    r.delete_time_local !== undefined &&
    r.mtime_remote >= r.delete_time_local
  ) {
    r.decision = "download_clearhist";
    r.decision_branch = 7;
  } else if (
    r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local === undefined &&
    r.delete_time_local !== undefined &&
    r.mtime_remote < r.delete_time_local
  ) {
    r.decision = "delremote_clearhist";
    r.decision_branch = 8;
  } else if (
    r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote !== undefined &&
    r.mtime_local === undefined &&
    r.delete_time_local == undefined
  ) {
    r.decision = "download";
    r.decision_branch = 9;
  } else if (!r.exist_remote && r.exist_local && r.mtime_remote === undefined) {
    r.decision = "upload_clearhist";
    r.decision_branch = 10;
  } else if (
    !r.exist_remote &&
    !r.exist_local &&
    r.mtime_remote === undefined &&
    r.mtime_local === undefined
  ) {
    r.decision = "clearhist";
    r.decision_branch = 11;
  }

  return r;
};

export const getSyncPlan = async (
  remote: S3ObjectType[],
  local: TAbstractFile[],
  deleteHistory: FileFolderHistoryRecord[],
  db: lf.DatabaseConnection,
  password: string = ""
) => {
  const mixedStates = await ensembleMixedStates(
    remote,
    local,
    deleteHistory,
    db,
    password
  );
  for (const [key, val] of Object.entries(mixedStates)) {
    getOperation(val, true, password);
  }
  const plan = {
    ts: Date.now(),
    remoteType: "s3",
    mixedStates: mixedStates,
  } as SyncPlanType;
  return plan;
};

export const doActualSync = async (
  s3Client: S3Client,
  s3Config: S3Config,
  db: lf.DatabaseConnection,
  vault: Vault,
  syncPlan: SyncPlanType,
  password: string = ""
) => {
  const keyStates = syncPlan.mixedStates;
  await Promise.all(
    Object.entries(keyStates)
      .sort((k, v) => -(k as string).length)
      .map(async ([k, v]) => {
        const key = k as string;
        const state = v as FileOrFolderMixedState;
        let remoteEncryptedKey = key;
        if (password !== "") {
          remoteEncryptedKey = state.remote_encrypted_key;
          if (remoteEncryptedKey === undefined || remoteEncryptedKey === "") {
            remoteEncryptedKey = await encryptStringToBase32(key, password);
          }
        }

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
            state.mtime_remote,
            password,
            remoteEncryptedKey
          );
          await clearDeleteRenameHistoryOfKey(db, state.key);
        } else if (state.decision === "upload_clearhist") {
          const remoteObjMeta = await uploadToRemote(
            s3Client,
            s3Config,
            state.key,
            vault,
            false,
            password,
            remoteEncryptedKey
          );
          await upsertSyncMetaMappingDataS3(
            db,
            state.key,
            state.mtime_local,
            state.size_local,
            state.key,
            remoteObjMeta.LastModified.valueOf(),
            remoteObjMeta.ContentLength,
            remoteObjMeta.ETag
          );
          await clearDeleteRenameHistoryOfKey(db, state.key);
        } else if (state.decision === "download") {
          await mkdirpInVault(state.key, vault);
          await downloadFromRemote(
            s3Client,
            s3Config,
            state.key,
            vault,
            state.mtime_remote,
            password,
            remoteEncryptedKey
          );
        } else if (state.decision === "delremote_clearhist") {
          await deleteFromRemote(
            s3Client,
            s3Config,
            state.key,
            password,
            remoteEncryptedKey
          );
          await clearDeleteRenameHistoryOfKey(db, state.key);
        } else if (state.decision === "upload") {
          const remoteObjMeta = await uploadToRemote(
            s3Client,
            s3Config,
            state.key,
            vault,
            false,
            password,
            remoteEncryptedKey
          );
          await upsertSyncMetaMappingDataS3(
            db,
            state.key,
            state.mtime_local,
            state.size_local,
            state.key,
            remoteObjMeta.LastModified.valueOf(),
            remoteObjMeta.ContentLength,
            remoteObjMeta.ETag
          );
        } else if (state.decision === "clearhist") {
          await clearDeleteRenameHistoryOfKey(db, state.key);
        } else {
          throw Error("this should never happen!");
        }
      })
  );
};
