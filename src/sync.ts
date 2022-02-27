import { TAbstractFile, TFile, TFolder, Vault } from "obsidian";
import type {
  RemoteItem,
  SUPPORTED_SERVICES_TYPE,
  DecisionType,
  FileOrFolderMixedState,
} from "./baseTypes";
import {
  decryptBase32ToString,
  decryptBase64urlToString,
  encryptStringToBase64url,
  MAGIC_ENCRYPTED_PREFIX_BASE32,
  MAGIC_ENCRYPTED_PREFIX_BASE64URL,
} from "./encrypt";
import type { FileFolderHistoryRecord, InternalDBs } from "./localdb";
import {
  clearDeleteRenameHistoryOfKeyAndVault,
  getSyncMetaMappingByRemoteKeyAndVault,
  upsertSyncMetaMappingDataByVault,
} from "./localdb";
import {
  isHiddenPath,
  isVaildText,
  mkdirpInVault,
  getFolderLevels,
  getParentFolder,
} from "./misc";
import { RemoteClient } from "./remote";
import {
  MetadataOnRemote,
  DeletionOnRemote,
  serializeMetadataOnRemote,
  deserializeMetadataOnRemote,
  DEFAULT_FILE_NAME_FOR_METADATAONREMOTE,
  DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2,
  isEqualMetadataOnRemote,
} from "./metadataOnRemote";

import * as origLog from "loglevel";
import { padEnd } from "lodash";
const log = origLog.getLogger("rs-default");

export type SyncStatusType =
  | "idle"
  | "preparing"
  | "getting_remote_files_list"
  | "getting_remote_extra_meta"
  | "getting_local_meta"
  | "checking_password"
  | "generating_plan"
  | "syncing"
  | "cleaning"
  | "finish";

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
  remote: RemoteItem[],
  password: string = ""
) => {
  if (remote === undefined || remote.length === 0) {
    // remote empty
    return {
      ok: true,
      reason: "empty_remote",
    } as PasswordCheckType;
  }
  const santyCheckKey = remote[0].key;
  if (santyCheckKey.startsWith(MAGIC_ENCRYPTED_PREFIX_BASE32)) {
    // this is encrypted using old base32!
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
  }
  if (santyCheckKey.startsWith(MAGIC_ENCRYPTED_PREFIX_BASE64URL)) {
    // this is encrypted using new base64url!
    // try to decrypt it using the provided password.
    if (password === "") {
      return {
        ok: false,
        reason: "remote_encrypted_local_no_password",
      } as PasswordCheckType;
    }
    try {
      const res = await decryptBase64urlToString(santyCheckKey, password);

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

export const parseRemoteItems = async (
  remote: RemoteItem[],
  db: InternalDBs,
  vaultRandomID: string,
  remoteType: SUPPORTED_SERVICES_TYPE,
  password: string = ""
) => {
  const remoteStates = [] as FileOrFolderMixedState[];
  let metadataFile: FileOrFolderMixedState = undefined;
  if (remote === undefined) {
    return {
      remoteStates: remoteStates,
      metadataFile: metadataFile,
    };
  }

  for (const entry of remote) {
    const remoteEncryptedKey = entry.key;
    let key = remoteEncryptedKey;
    if (password !== "") {
      if (remoteEncryptedKey.startsWith(MAGIC_ENCRYPTED_PREFIX_BASE32)) {
        key = await decryptBase32ToString(remoteEncryptedKey, password);
      } else if (
        remoteEncryptedKey.startsWith(MAGIC_ENCRYPTED_PREFIX_BASE64URL)
      ) {
        key = await decryptBase64urlToString(remoteEncryptedKey, password);
      } else {
        throw Error(`unexpected key=${remoteEncryptedKey}`);
      }
    }
    const backwardMapping = await getSyncMetaMappingByRemoteKeyAndVault(
      remoteType,
      db,
      key,
      entry.lastModified,
      entry.etag,
      vaultRandomID
    );

    let r = {} as FileOrFolderMixedState;
    if (backwardMapping !== undefined) {
      key = backwardMapping.localKey;
      r = {
        key: key,
        existRemote: true,
        mtimeRemote: backwardMapping.localMtime || entry.lastModified,
        sizeRemote: backwardMapping.localSize || entry.size,
        remoteEncryptedKey: remoteEncryptedKey,
        changeMtimeUsingMapping: true,
      };
    } else {
      r = {
        key: key,
        existRemote: true,
        mtimeRemote: entry.lastModified,
        sizeRemote: entry.size,
        remoteEncryptedKey: remoteEncryptedKey,
        changeMtimeUsingMapping: false,
      };
    }

    if (r.key === DEFAULT_FILE_NAME_FOR_METADATAONREMOTE) {
      metadataFile = Object.assign({}, r);
    }
    if (r.key === DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2) {
      throw Error(
        `A reserved file name ${r.key} has been found. You may upgrade the plugin to latest version to try to deal with it.`
      );
    }

    remoteStates.push(r);
  }
  return {
    remoteStates: remoteStates,
    metadataFile: metadataFile,
  };
};

export const fetchMetadataFile = async (
  metadataFile: FileOrFolderMixedState,
  client: RemoteClient,
  vault: Vault,
  password: string = ""
) => {
  if (metadataFile === undefined) {
    log.debug("no metadata file, so no fetch");
    return {
      deletions: [],
    } as MetadataOnRemote;
  }

  const buf = await client.downloadFromRemote(
    metadataFile.key,
    vault,
    metadataFile.mtimeRemote,
    password,
    metadataFile.remoteEncryptedKey,
    true
  );
  const metadata = deserializeMetadataOnRemote(buf);
  return metadata;
};

const ensembleMixedStates = async (
  remoteStates: FileOrFolderMixedState[],
  local: TAbstractFile[],
  remoteDeleteHistory: DeletionOnRemote[],
  localDeleteHistory: FileFolderHistoryRecord[]
) => {
  const results = {} as Record<string, FileOrFolderMixedState>;

  for (const r of remoteStates) {
    const key = r.key;

    if (isHiddenPath(key)) {
      continue;
    }
    results[key] = r;
    results[key].existLocal = false;
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
        existLocal: true,
        mtimeLocal: entry.stat.mtime,
        sizeLocal: entry.stat.size,
      };
    } else if (entry instanceof TFolder) {
      key = `${entry.path}/`;
      r = {
        key: key,
        existLocal: true,
        mtimeLocal: undefined,
        sizeLocal: 0,
      };
    } else {
      throw Error(`unexpected ${entry}`);
    }

    if (isHiddenPath(key)) {
      continue;
    }
    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].existLocal = r.existLocal;
      results[key].mtimeLocal = r.mtimeLocal;
      results[key].sizeLocal = r.sizeLocal;
    } else {
      results[key] = r;
      results[key].existRemote = false;
    }
  }

  for (const entry of remoteDeleteHistory) {
    const key = entry.key;
    const r = {
      key: key,
      deltimeRemote: entry.actionWhen,
    } as FileOrFolderMixedState;

    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].deltimeRemote = r.deltimeRemote;
    } else {
      results[key] = r;

      results[key].existLocal = false;
      results[key].existRemote = false;
    }
  }

  for (const entry of localDeleteHistory) {
    let key = entry.key;
    if (entry.keyType === "folder") {
      if (!entry.key.endsWith("/")) {
        key = `${entry.key}/`;
      }
    } else if (entry.keyType === "file") {
      // pass
    } else {
      throw Error(`unexpected ${entry}`);
    }

    const r = {
      key: key,
      deltimeLocal: entry.actionWhen,
    } as FileOrFolderMixedState;

    if (isHiddenPath(key)) {
      continue;
    }
    if (results.hasOwnProperty(key)) {
      results[key].key = r.key;
      results[key].deltimeLocal = r.deltimeLocal;
    } else {
      results[key] = r;

      results[key].existLocal = false;
      results[key].existRemote = false;
    }
  }

  return results;
};

const assignOperationToFileInplace = (
  origRecord: FileOrFolderMixedState,
  keptFolder: Set<string>,
  password: string = ""
) => {
  let r = origRecord;

  // files and folders are treated differently
  // here we only check files
  if (r.key.endsWith("/")) {
    return r;
  }

  // we find the max date from four sources

  // 0. find anything inconsistent
  if (r.existLocal && (r.mtimeLocal === undefined || r.mtimeLocal <= 0)) {
    throw Error(
      `Error: File ${r.key} has a last modified time <=0 or undefined in the local file system. It's abnormal and the plugin stops.`
    );
  }
  if (r.existRemote && (r.mtimeRemote === undefined || r.mtimeRemote <= 0)) {
    throw Error(
      `Error: File ${r.key} has a last modified time <=0 or undefined on the remote service. It's abnormal and the plugin stops.`
    );
  }
  if (r.deltimeLocal !== undefined && r.deltimeLocal <= 0) {
    throw Error(
      `Error: File ${r.key} has a local deletion time <=0. It's abnormal and the plugin stops.`
    );
  }
  if (r.deltimeRemote !== undefined && r.deltimeRemote <= 0) {
    throw Error(
      `Error: File ${r.key} has a remote deletion time <=0. It's abnormal and the plugin stops.`
    );
  }

  // 1. mtimeLocal
  if (r.existLocal) {
    const mtimeRemote = r.existRemote ? r.mtimeRemote : -1;
    const deltime_remote = r.deltimeRemote !== undefined ? r.deltimeRemote : -1;
    const deltimeLocal = r.deltimeLocal !== undefined ? r.deltimeLocal : -1;
    if (
      r.mtimeLocal >= mtimeRemote &&
      r.mtimeLocal >= deltimeLocal &&
      r.mtimeLocal >= deltime_remote
    ) {
      if (r.mtimeLocal === r.mtimeRemote) {
        // mtime the same
        if (password === "") {
          // no password, we can also compare the sizes!
          if (r.sizeLocal === r.sizeRemote) {
            r.decision = "skipUploading";
            r.decisionBranch = 1;
          } else {
            r.decision = "uploadLocalToRemote";
            r.decisionBranch = 2;
          }
        } else {
          // we have password, then the sizes are always unequal
          // we can only rely on mtime
          r.decision = "skipUploading";
          r.decisionBranch = 3;
        }
      } else {
        r.decision = "uploadLocalToRemote";
        r.decisionBranch = 4;
      }
      keptFolder.add(getParentFolder(r.key));
      return r;
    }
  }

  // 2. mtimeRemote
  if (r.existRemote) {
    const mtimeLocal = r.existLocal ? r.mtimeLocal : -1;
    const deltime_remote = r.deltimeRemote !== undefined ? r.deltimeRemote : -1;
    const deltimeLocal = r.deltimeLocal !== undefined ? r.deltimeLocal : -1;
    if (
      r.mtimeRemote > mtimeLocal &&
      r.mtimeRemote >= deltimeLocal &&
      r.mtimeRemote >= deltime_remote
    ) {
      r.decision = "downloadRemoteToLocal";
      r.decisionBranch = 5;
      keptFolder.add(getParentFolder(r.key));
      return r;
    }
  }

  // 3. deltimeLocal
  if (r.deltimeLocal !== undefined && r.deltimeLocal !== 0) {
    const mtimeLocal = r.existLocal ? r.mtimeLocal : -1;
    const mtimeRemote = r.existRemote ? r.mtimeRemote : -1;
    const deltime_remote = r.deltimeRemote !== undefined ? r.deltimeRemote : -1;
    if (
      r.deltimeLocal >= mtimeLocal &&
      r.deltimeLocal >= mtimeRemote &&
      r.deltimeLocal >= deltime_remote
    ) {
      r.decision = "uploadLocalDelHistToRemote";
      r.decisionBranch = 6;
      if (r.existLocal || r.existRemote) {
        // actual deletion would happen
      }
      return r;
    }
  }

  // 4. deltime_remote
  if (r.deltimeRemote !== undefined && r.deltimeRemote !== 0) {
    const mtimeLocal = r.existLocal ? r.mtimeLocal : -1;
    const mtimeRemote = r.existRemote ? r.mtimeRemote : -1;
    const deltimeLocal = r.deltimeLocal !== undefined ? r.deltimeLocal : -1;
    if (
      r.deltimeRemote >= mtimeLocal &&
      r.deltimeRemote >= mtimeRemote &&
      r.deltimeRemote >= deltimeLocal
    ) {
      r.decision = "keepRemoteDelHist";
      r.decisionBranch = 7;
      if (r.existLocal || r.existRemote) {
        // actual deletion would happen
      }
      return r;
    }
  }

  throw Error(`no decision for ${JSON.stringify(r)}`);
};

const assignOperationToFolderInplace = (
  origRecord: FileOrFolderMixedState,
  keptFolder: Set<string>,
  password: string = ""
) => {
  let r = origRecord;

  // files and folders are treated differently
  // here we only check folders
  if (!r.key.endsWith("/")) {
    return r;
  }

  if (!keptFolder.has(r.key)) {
    // the folder does NOT have any must-be-kept children!

    if (r.deltimeLocal !== undefined || r.deltimeRemote !== undefined) {
      // it has some deletion "commands"
      if (
        r.deltimeLocal !== undefined &&
        r.deltimeLocal >= (r.deltimeRemote !== undefined ? r.deltimeRemote : -1)
      ) {
        r.decision = "uploadLocalDelHistToRemoteFolder";
        r.decisionBranch = 8;
      } else {
        r.decision = "keepRemoteDelHistFolder";
        r.decisionBranch = 9;
      }
    } else {
      // it does not have any deletion commands
      // keep it as is, and create it if necessary
      keptFolder.add(getParentFolder(r.key));
      if (r.existLocal && r.existRemote) {
        r.decision = "skipFolder";
        r.decisionBranch = 10;
      } else if (r.existLocal || r.existRemote) {
        r.decision = "createFolder";
        r.decisionBranch = 11;
      } else {
        throw Error(
          `Error: Folder ${r.key} doesn't exist locally and remotely but is marked must be kept. Abort.`
        );
      }
    }
  } else {
    // the folder has some must be kept children!
    // so itself and its parent folder must be kept
    keptFolder.add(getParentFolder(r.key));
    if (r.existLocal && r.existRemote) {
      r.decision = "skipFolder";
      r.decisionBranch = 12;
    } else if (r.existLocal || r.existRemote) {
      r.decision = "createFolder";
      r.decisionBranch = 13;
    } else {
      throw Error(
        `Error: Folder ${r.key} doesn't exist locally and remotely but is marked must be kept. Abort.`
      );
    }
  }

  // save the memory, save the world!
  // we have dealt with it, so we don't need it any more.
  keptFolder.delete(r.key);
  return r;
};

const DELETION_DECISIONS: Set<DecisionType> = new Set([
  "uploadLocalDelHistToRemote",
  "keepRemoteDelHist",
  "uploadLocalDelHistToRemoteFolder",
  "keepRemoteDelHistFolder",
]);

export const getSyncPlan = async (
  remoteStates: FileOrFolderMixedState[],
  local: TAbstractFile[],
  remoteDeleteHistory: DeletionOnRemote[],
  localDeleteHistory: FileFolderHistoryRecord[],
  remoteType: SUPPORTED_SERVICES_TYPE,
  password: string = ""
) => {
  const mixedStates = await ensembleMixedStates(
    remoteStates,
    local,
    remoteDeleteHistory,
    localDeleteHistory
  );

  const sortedKeys = Object.keys(mixedStates).sort(
    (k1, k2) => k2.length - k1.length
  );

  const deletions: DeletionOnRemote[] = [];

  const keptFolder = new Set<string>();
  for (let i = 0; i < sortedKeys.length; ++i) {
    const key = sortedKeys[i];
    const val = mixedStates[key];

    if (key.endsWith("/")) {
      // decide some folders
      // because the keys are sorted by length
      // so all the children must have been shown up before in the iteration
      assignOperationToFolderInplace(val, keptFolder, password);
    } else {
      // get all operations of files
      // and at the same time get some helper info for folders
      assignOperationToFileInplace(val, keptFolder, password);
    }

    if (DELETION_DECISIONS.has(val.decision)) {
      if (val.decision === "uploadLocalDelHistToRemote") {
        deletions.push({
          key: key,
          actionWhen: val.deltimeLocal,
        });
      } else if (val.decision === "keepRemoteDelHist") {
        deletions.push({
          key: key,
          actionWhen: val.deltimeRemote,
        });
      } else if (val.decision === "uploadLocalDelHistToRemoteFolder") {
        deletions.push({
          key: key,
          actionWhen: val.deltimeLocal,
        });
      } else if (val.decision === "keepRemoteDelHistFolder") {
        deletions.push({
          key: key,
          actionWhen: val.deltimeRemote,
        });
      } else {
        throw Error(`do not know how to delete for decision ${val.decision}`);
      }
    }
  }

  const plan = {
    ts: Date.now(),
    remoteType: remoteType,
    mixedStates: mixedStates,
  } as SyncPlanType;
  return {
    plan: plan,
    sortedKeys: sortedKeys,
    deletions: deletions,
  };
};

const uploadExtraMeta = async (
  client: RemoteClient,
  metadataFile: FileOrFolderMixedState | undefined,
  origMetadata: MetadataOnRemote | undefined,
  deletions: DeletionOnRemote[],
  password: string = ""
) => {
  if (deletions === undefined || deletions.length === 0) {
    return;
  }

  const key = DEFAULT_FILE_NAME_FOR_METADATAONREMOTE;
  let remoteEncryptedKey = key;

  if (password !== "") {
    if (metadataFile === undefined) {
      remoteEncryptedKey = undefined;
    } else {
      remoteEncryptedKey = metadataFile.remoteEncryptedKey;
    }
    if (remoteEncryptedKey === undefined || remoteEncryptedKey === "") {
      // remoteEncryptedKey = await encryptStringToBase32(key, password);
      remoteEncryptedKey = await encryptStringToBase64url(key, password);
    }
  }

  const newMetadata: MetadataOnRemote = {
    deletions: deletions,
  };

  if (isEqualMetadataOnRemote(origMetadata, newMetadata)) {
    log.debug(
      "metadata are the same, no need to re-generate and re-upload it."
    );
    return;
  }

  const resultText = serializeMetadataOnRemote(newMetadata);

  await client.uploadToRemote(
    key,
    undefined,
    false,
    password,
    remoteEncryptedKey,
    undefined,
    true,
    resultText
  );
};

const dispatchOperationToActual = async (
  key: string,
  vaultRandomID: string,
  r: FileOrFolderMixedState,
  client: RemoteClient,
  db: InternalDBs,
  vault: Vault,
  localDeleteFunc: any,
  password: string = ""
) => {
  let remoteEncryptedKey = key;
  if (password !== "") {
    remoteEncryptedKey = r.remoteEncryptedKey;
    if (remoteEncryptedKey === undefined || remoteEncryptedKey === "") {
      // the old version uses base32
      // remoteEncryptedKey = await encryptStringToBase32(key, password);
      // the new version users base64url
      remoteEncryptedKey = await encryptStringToBase64url(key, password);
    }
  }

  if (r.decision === undefined) {
    throw Error(`unknown decision in ${JSON.stringify(r)}`);
  } else if (r.decision === "skipUploading") {
    // do nothing!
  } else if (r.decision === "uploadLocalDelHistToRemote") {
    if (r.existLocal) {
      await localDeleteFunc(r.key);
    }
    if (r.existRemote) {
      await client.deleteFromRemote(r.key, password, remoteEncryptedKey);
    }
    await clearDeleteRenameHistoryOfKeyAndVault(db, r.key, vaultRandomID);
  } else if (r.decision === "keepRemoteDelHist") {
    if (r.existLocal) {
      await localDeleteFunc(r.key);
    }
    if (r.existRemote) {
      await client.deleteFromRemote(r.key, password, remoteEncryptedKey);
    }
    await clearDeleteRenameHistoryOfKeyAndVault(db, r.key, vaultRandomID);
  } else if (r.decision === "uploadLocalToRemote") {
    if (
      client.serviceType === "onedrive" &&
      r.sizeLocal === 0 &&
      password === ""
    ) {
      // special treatment for empty files for OneDrive
      // TODO: it's ugly, any other way?
      // special treatment for OneDrive: do nothing, skip empty file without encryption
      // if it's empty folder, or it's encrypted file/folder, it continues to be uploaded.
    } else {
      const remoteObjMeta = await client.uploadToRemote(
        r.key,
        vault,
        false,
        password,
        remoteEncryptedKey
      );
      await upsertSyncMetaMappingDataByVault(
        client.serviceType,
        db,
        r.key,
        r.mtimeLocal,
        r.sizeLocal,
        r.key,
        remoteObjMeta.lastModified,
        remoteObjMeta.size,
        remoteObjMeta.etag,
        vaultRandomID
      );
    }
    await clearDeleteRenameHistoryOfKeyAndVault(db, r.key, vaultRandomID);
  } else if (r.decision === "downloadRemoteToLocal") {
    await mkdirpInVault(r.key, vault); /* should be unnecessary */
    await client.downloadFromRemote(
      r.key,
      vault,
      r.mtimeRemote,
      password,
      remoteEncryptedKey
    );
    await clearDeleteRenameHistoryOfKeyAndVault(db, r.key, vaultRandomID);
  } else if (r.decision === "createFolder") {
    if (!r.existLocal) {
      await mkdirpInVault(r.key, vault);
    }
    if (!r.existRemote) {
      const remoteObjMeta = await client.uploadToRemote(
        r.key,
        vault,
        false,
        password,
        remoteEncryptedKey
      );
      await upsertSyncMetaMappingDataByVault(
        client.serviceType,
        db,
        r.key,
        r.mtimeLocal,
        r.sizeLocal,
        r.key,
        remoteObjMeta.lastModified,
        remoteObjMeta.size,
        remoteObjMeta.etag,
        vaultRandomID
      );
    }
    await clearDeleteRenameHistoryOfKeyAndVault(db, r.key, vaultRandomID);
  } else if (r.decision === "uploadLocalDelHistToRemoteFolder") {
    if (r.existLocal) {
      await localDeleteFunc(r.key);
    }
    if (r.existRemote) {
      await client.deleteFromRemote(r.key, password, remoteEncryptedKey);
    }
    await clearDeleteRenameHistoryOfKeyAndVault(db, r.key, vaultRandomID);
  } else if (r.decision === "keepRemoteDelHistFolder") {
    if (r.existLocal) {
      await localDeleteFunc(r.key);
    }
    if (r.existRemote) {
      await client.deleteFromRemote(r.key, password, remoteEncryptedKey);
    }
    await clearDeleteRenameHistoryOfKeyAndVault(db, r.key, vaultRandomID);
  } else if (r.decision === "skipFolder") {
    // do nothing!
  } else {
    throw Error(`unknown decision in ${JSON.stringify(r)}`);
  }
};

export const doActualSync = async (
  client: RemoteClient,
  db: InternalDBs,
  vaultRandomID: string,
  vault: Vault,
  syncPlan: SyncPlanType,
  sortedKeys: string[],
  metadataFile: FileOrFolderMixedState,
  origMetadata: MetadataOnRemote,
  deletions: DeletionOnRemote[],
  localDeleteFunc: any,
  password: string = "",
  callbackSyncProcess?: any
) => {
  const mixedStates = syncPlan.mixedStates;
  let i = 0;
  const totalCount = sortedKeys.length || 0;

  log.debug(`start syncing extra data firstly`);
  await uploadExtraMeta(
    client,
    metadataFile,
    origMetadata,
    deletions,
    password
  );
  log.debug(`finish syncing extra data firstly`);

  for (let i = 0; i < sortedKeys.length; ++i) {
    const key = sortedKeys[i];
    const val = mixedStates[key];

    log.debug(`start syncing "${key}" with plan ${JSON.stringify(val)}`);

    if (callbackSyncProcess !== undefined) {
      await callbackSyncProcess(i, totalCount, key, val.decision);
    }

    await dispatchOperationToActual(
      key,
      vaultRandomID,
      val,
      client,
      db,
      vault,
      localDeleteFunc,
      password
    );
    log.debug(`finished ${key}`);

    // await Promise.all(
    //   Object.entries(mixedStates).map(async ([k, v]) =>
    //     dispatchOperationToActual(
    //       k as string,
    //       vaultRandomID,
    //       v as FileOrFolderMixedState,
    //       client,
    //       db,
    //       vault,
    //       localDeleteFunc,
    //       password
    //     )
    //   )
    // );
  }
};
