import PQueue from "p-queue";
import XRegExp from "xregexp";
import type {
  CipherMethodType,
  ConflictActionType,
  EmptyFolderCleanType,
  Entity,
  MixedEntity,
  SUPPORTED_SERVICES_TYPE,
  SyncDirectionType,
} from "./baseTypes";
import { isInsideObsFolder } from "./obsFolderLister";
import {
  isSpecialFolderNameToSkip,
  isHiddenPath,
  unixTimeToStr,
  getParentFolder,
  isVaildText,
  atWhichLevel,
  mkdirpInVault,
} from "./misc";
import {
  DEFAULT_FILE_NAME_FOR_METADATAONREMOTE,
  DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2,
} from "./metadataOnRemote";
import { RemoteClient } from "./remote";
import { Vault } from "obsidian";

import AggregateError from "aggregate-error";
import {
  InternalDBs,
  clearPrevSyncRecordByVaultAndProfile,
  upsertPrevSyncRecordByVaultAndProfile,
} from "./localdb";
import { Cipher } from "./encryptUnified";

export type SyncStatusType =
  | "idle"
  | "preparing"
  | "getting_remote_files_list"
  | "getting_local_meta"
  | "getting_local_prev_sync"
  | "checking_password"
  | "generating_plan"
  | "syncing"
  | "cleaning"
  | "finish";

export interface PasswordCheckType {
  ok: boolean;
  reason:
    | "empty_remote"
    | "unknown_encryption_method"
    | "remote_encrypted_local_no_password"
    | "password_matched"
    | "password_not_matched_or_remote_not_encrypted"
    | "likely_no_password_both_sides";
}

export const isPasswordOk = async (
  remote: Entity[],
  cipher: Cipher
): Promise<PasswordCheckType> => {
  if (remote === undefined || remote.length === 0) {
    // remote empty
    return {
      ok: true,
      reason: "empty_remote",
    };
  }
  const santyCheckKey = remote[0].keyRaw;

  if (cipher.isPasswordEmpty()) {
    // TODO: no way to distinguish remote rclone encrypted
    //       if local has no password??
    if (Cipher.isLikelyEncryptedName(santyCheckKey)) {
      return {
        ok: false,
        reason: "remote_encrypted_local_no_password",
      };
    } else {
      return {
        ok: true,
        reason: "likely_no_password_both_sides",
      };
    }
  } else {
    if (cipher.method === "unknown") {
      return {
        ok: false,
        reason: "unknown_encryption_method",
      };
    }
    try {
      await cipher.decryptName(santyCheckKey);
      return {
        ok: true,
        reason: "password_matched",
      };
    } catch (error) {
      return {
        ok: false,
        reason: "password_not_matched_or_remote_not_encrypted",
      };
    }
  }
};

const isSkipItemByName = (
  key: string,
  syncConfigDir: boolean,
  syncUnderscoreItems: boolean,
  configDir: string,
  ignorePaths: string[]
) => {
  if (key === undefined) {
    throw Error(`isSkipItemByName meets undefinded key!`);
  }
  if (ignorePaths !== undefined && ignorePaths.length > 0) {
    for (const r of ignorePaths) {
      if (XRegExp(r, "A").test(key)) {
        return true;
      }
    }
  }
  if (syncConfigDir && isInsideObsFolder(key, configDir)) {
    return false;
  }
  if (isSpecialFolderNameToSkip(key, [])) {
    // some special dirs and files are always skipped
    return true;
  }
  return (
    isHiddenPath(key, true, false) ||
    (!syncUnderscoreItems && isHiddenPath(key, false, true)) ||
    key === DEFAULT_FILE_NAME_FOR_METADATAONREMOTE ||
    key === DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2
  );
};

const copyEntityAndFixTimeFormat = (
  src: Entity,
  serviceType: SUPPORTED_SERVICES_TYPE
) => {
  const result = Object.assign({}, src);
  if (result.mtimeCli !== undefined) {
    if (result.mtimeCli === 0) {
      result.mtimeCli = undefined;
    } else {
      if (serviceType === "s3") {
        // round to second instead of millisecond
        result.mtimeCli = Math.floor(result.mtimeCli / 1000.0) * 1000;
      }
      result.mtimeCliFmt = unixTimeToStr(result.mtimeCli);
    }
  }
  if (result.mtimeSvr !== undefined) {
    if (result.mtimeSvr === 0) {
      result.mtimeSvr = undefined;
    } else {
      if (serviceType === "s3") {
        // round to second instead of millisecond
        result.mtimeSvr = Math.floor(result.mtimeSvr / 1000.0) * 1000;
      }
      result.mtimeSvrFmt = unixTimeToStr(result.mtimeSvr);
    }
  }
  if (result.prevSyncTime !== undefined) {
    if (result.prevSyncTime === 0) {
      result.prevSyncTime = undefined;
    } else {
      if (serviceType === "s3") {
        // round to second instead of millisecond
        result.prevSyncTime = Math.floor(result.prevSyncTime / 1000.0) * 1000;
      }
      result.prevSyncTimeFmt = unixTimeToStr(result.prevSyncTime);
    }
  }

  return result;
};

/**
 * Inplace, no copy again.
 */
const decryptRemoteEntityInplace = async (remote: Entity, cipher: Cipher) => {
  if (cipher?.isPasswordEmpty()) {
    remote.key = remote.keyRaw;
    remote.keyEnc = remote.keyRaw;
    remote.size = remote.sizeRaw;
    remote.sizeEnc = remote.sizeRaw;
    return remote;
  }

  remote.keyEnc = remote.keyRaw;
  remote.key = await cipher.decryptName(remote.keyEnc);
  remote.sizeEnc = remote.sizeRaw;

  // TODO
  // remote.size = getSizeFromEncToOrig(remote.sizeEnc, password);
  // but we don't have deterministic way to get a number because the encryption has padding...

  return remote;
};

const fullfillMTimeOfRemoteEntityInplace = (
  remote: Entity,
  mtimeCli?: number
) => {
  if (
    mtimeCli !== undefined &&
    mtimeCli > 0 &&
    (remote.mtimeCli === undefined ||
      remote.mtimeCli <= 0 ||
      (remote.mtimeSvr !== undefined &&
        remote.mtimeSvr > 0 &&
        remote.mtimeCli >= remote.mtimeSvr))
  ) {
    remote.mtimeCli = mtimeCli;
  }
  return remote;
};

/**
 * Directly throw error here.
 * We can only defer the checking now, because before decryption we don't know whether it's a file or folder.
 * @param remote
 */
const ensureMTimeOfRemoteEntityValid = (remote: Entity) => {
  if (
    !remote.key!.endsWith("/") &&
    remote.mtimeCli === undefined &&
    remote.mtimeSvr === undefined
  ) {
    if (remote.key === remote.keyEnc) {
      throw Error(
        `Your remote file ${remote.key} has last modified time 0, don't know how to deal with it.`
      );
    } else {
      throw Error(
        `Your remote file ${remote.key} (encrypted as ${remote.keyEnc}) has last modified time 0, don't know how to deal with it.`
      );
    }
  }
  return remote;
};

/**
 * Inplace, no copy again.
 */
const encryptLocalEntityInplace = async (
  local: Entity,
  cipher: Cipher,
  remoteKeyEnc: string | undefined
) => {
  // console.debug(
  //   `encryptLocalEntityInplace: local=${JSON.stringify(
  //     local,
  //     null,
  //     2
  //   )}, password=${
  //     password === undefined || password === "" ? "[empty]" : "[not empty]"
  //   }, remoteKeyEnc=${remoteKeyEnc}`
  // );

  if (local.key === undefined) {
    // local.key should always have value
    throw Error(`local ${local.keyRaw} is abnormal without key`);
  }

  if (cipher.isPasswordEmpty()) {
    local.sizeEnc = local.sizeRaw; // if no enc, the remote file has the same size
    local.keyEnc = local.keyRaw;
    return local;
  }

  // below is for having password
  if (local.sizeEnc === undefined && local.size !== undefined) {
    // it's not filled yet, we fill it
    // local.size is possibly undefined if it's "prevSync" Entity
    // but local.key should always have value
    local.sizeEnc = cipher.getSizeFromOrigToEnc(local.size);
  }

  if (local.keyEnc === undefined || local.keyEnc === "") {
    if (
      remoteKeyEnc !== undefined &&
      remoteKeyEnc !== "" &&
      remoteKeyEnc !== local.key
    ) {
      // we can reuse remote encrypted key if any
      local.keyEnc = remoteKeyEnc;
    } else {
      // we assign a new encrypted key because of no remote
      local.keyEnc = await cipher.encryptName(local.key);
    }
  }
  return local;
};

export type SyncPlanType = Record<string, MixedEntity>;

export const ensembleMixedEnties = async (
  localEntityList: Entity[],
  prevSyncEntityList: Entity[],
  remoteEntityList: Entity[],

  syncConfigDir: boolean,
  configDir: string,
  syncUnderscoreItems: boolean,
  ignorePaths: string[],
  cipher: Cipher,
  serviceType: SUPPORTED_SERVICES_TYPE
): Promise<SyncPlanType> => {
  const finalMappings: SyncPlanType = {};

  // remote has to be first
  for (const remote of remoteEntityList) {
    const remoteCopied = ensureMTimeOfRemoteEntityValid(
      await decryptRemoteEntityInplace(
        copyEntityAndFixTimeFormat(remote, serviceType),
        cipher
      )
    );

    const key = remoteCopied.key!;
    if (
      isSkipItemByName(
        key,
        syncConfigDir,
        syncUnderscoreItems,
        configDir,
        ignorePaths
      )
    ) {
      continue;
    }

    finalMappings[key] = {
      key: key,
      remote: remoteCopied,
    };
  }

  if (Object.keys(finalMappings).length === 0 || localEntityList.length === 0) {
    // Special checking:
    // if one side is totally empty,
    // usually that's a hard rest.
    // So we need to ignore everything of prevSyncEntityList to avoid deletions!
    // TODO: acutally erase everything of prevSyncEntityList?
    // TODO: local should also go through a isSkipItemByName checking beforehand
  } else {
    // normally go through the prevSyncEntityList
    for (const prevSync of prevSyncEntityList) {
      const key = prevSync.key!;
      if (
        isSkipItemByName(
          key,
          syncConfigDir,
          syncUnderscoreItems,
          configDir,
          ignorePaths
        )
      ) {
        continue;
      }

      if (finalMappings.hasOwnProperty(key)) {
        const prevSyncCopied = await encryptLocalEntityInplace(
          copyEntityAndFixTimeFormat(prevSync, serviceType),
          cipher,
          finalMappings[key].remote?.keyEnc
        );
        finalMappings[key].prevSync = prevSyncCopied;
      } else {
        const prevSyncCopied = await encryptLocalEntityInplace(
          copyEntityAndFixTimeFormat(prevSync, serviceType),
          cipher,
          undefined
        );
        finalMappings[key] = {
          key: key,
          prevSync: prevSyncCopied,
        };
      }
    }
  }

  // local has to be last
  // because we want to get keyEnc based on the remote
  // (we don't consume prevSync here because it gains no benefit)
  for (const local of localEntityList) {
    const key = local.key!;
    if (
      isSkipItemByName(
        key,
        syncConfigDir,
        syncUnderscoreItems,
        configDir,
        ignorePaths
      )
    ) {
      continue;
    }

    if (finalMappings.hasOwnProperty(key)) {
      const localCopied = await encryptLocalEntityInplace(
        copyEntityAndFixTimeFormat(local, serviceType),
        cipher,
        finalMappings[key].remote?.keyEnc
      );
      finalMappings[key].local = localCopied;
    } else {
      const localCopied = await encryptLocalEntityInplace(
        copyEntityAndFixTimeFormat(local, serviceType),
        cipher,
        undefined
      );
      finalMappings[key] = {
        key: key,
        local: localCopied,
      };
    }
  }

  console.debug("in the end of ensembleMixedEnties, finalMappings is:");
  console.debug(finalMappings);
  return finalMappings;
};

/**
 * Heavy lifting.
 * Basically follow the sync algorithm of https://github.com/Jwink3101/syncrclone
 * Also deal with syncDirection which makes it more complicated
 */
export const getSyncPlanInplace = async (
  mixedEntityMappings: Record<string, MixedEntity>,
  howToCleanEmptyFolder: EmptyFolderCleanType,
  skipSizeLargerThan: number,
  conflictAction: ConflictActionType,
  syncDirection: SyncDirectionType
) => {
  // from long(deep) to short(shadow)
  const sortedKeys = Object.keys(mixedEntityMappings).sort(
    (k1, k2) => k2.length - k1.length
  );

  const keptFolder = new Set<string>();

  for (let i = 0; i < sortedKeys.length; ++i) {
    const key = sortedKeys[i];
    const mixedEntry = mixedEntityMappings[key];
    const { local, prevSync, remote } = mixedEntry;

    // console.debug(`getSyncPlanInplace: key=${key}`)

    if (key.endsWith("/")) {
      // folder
      // folder doesn't worry about mtime and size, only check their existences
      if (keptFolder.has(key)) {
        // parent should also be kept
        // console.debug(`${key} in keptFolder`)
        keptFolder.add(getParentFolder(key));
        // should fill the missing part
        if (local !== undefined && remote !== undefined) {
          mixedEntry.decisionBranch = 101;
          mixedEntry.decision = "folder_existed_both_then_do_nothing";
        } else if (local !== undefined && remote === undefined) {
          if (syncDirection === "incremental_pull_only") {
            mixedEntry.decisionBranch = 107;
            mixedEntry.decision = "folder_to_skip";
          } else {
            mixedEntry.decisionBranch = 102;
            mixedEntry.decision =
              "folder_existed_local_then_also_create_remote";
          }
        } else if (local === undefined && remote !== undefined) {
          if (syncDirection === "incremental_push_only") {
            mixedEntry.decisionBranch = 108;
            mixedEntry.decision = "folder_to_skip";
          } else {
            mixedEntry.decisionBranch = 103;
            mixedEntry.decision =
              "folder_existed_remote_then_also_create_local";
          }
        } else {
          // why?? how??
          mixedEntry.decisionBranch = 104;
          mixedEntry.decision = "folder_to_be_created";
        }
        keptFolder.delete(key); // no need to save it in the Set later
      } else {
        if (howToCleanEmptyFolder === "skip") {
          mixedEntry.decisionBranch = 105;
          mixedEntry.decision = "folder_to_skip";
        } else if (howToCleanEmptyFolder === "clean_both") {
          mixedEntry.decisionBranch = 106;
          mixedEntry.decision = "folder_to_be_deleted";
          // TODO: what to do in different sync direction?
        } else {
          throw Error(
            `do not know how to deal with empty folder ${mixedEntry.key}`
          );
        }
      }
    } else {
      // file

      if (local === undefined && remote === undefined) {
        // both deleted, only in history
        mixedEntry.decisionBranch = 1;
        mixedEntry.decision = "only_history";
      } else if (local !== undefined && remote !== undefined) {
        if (
          (local.mtimeCli === remote.mtimeCli ||
            local.mtimeCli === remote.mtimeSvr) &&
          local.sizeEnc === remote.sizeEnc
        ) {
          // completely equal / identical
          mixedEntry.decisionBranch = 2;
          mixedEntry.decision = "equal";
          keptFolder.add(getParentFolder(key));
        } else {
          // Both exists, but modified or conflict
          // Look for past files of A or B.

          const localEqualPrevSync =
            prevSync?.mtimeCli === local.mtimeCli &&
            prevSync?.sizeEnc === local.sizeEnc;
          const remoteEqualPrevSync =
            (prevSync?.mtimeSvr === remote.mtimeCli ||
              prevSync?.mtimeSvr === remote.mtimeSvr) &&
            prevSync?.sizeEnc === remote.sizeEnc;

          if (localEqualPrevSync && !remoteEqualPrevSync) {
            // If only one compares true (no prev also means it compares False), the other is modified. Backup and sync.
            if (
              skipSizeLargerThan <= 0 ||
              remote.sizeEnc! <= skipSizeLargerThan
            ) {
              if (syncDirection === "incremental_push_only") {
                mixedEntry.decisionBranch = 26;
                mixedEntry.decision = "conflict_modified_then_keep_local";
                keptFolder.add(getParentFolder(key));
              } else {
                mixedEntry.decisionBranch = 9;
                mixedEntry.decision = "remote_is_modified_then_pull";
                keptFolder.add(getParentFolder(key));
              }
            } else {
              throw Error(
                `remote is modified (branch 9) but size larger than ${skipSizeLargerThan}, don't know what to do: ${JSON.stringify(
                  mixedEntry
                )}`
              );
            }
          } else if (!localEqualPrevSync && remoteEqualPrevSync) {
            // If only one compares true (no prev also means it compares False), the other is modified. Backup and sync.
            if (
              skipSizeLargerThan <= 0 ||
              local.sizeEnc! <= skipSizeLargerThan
            ) {
              if (syncDirection === "incremental_pull_only") {
                mixedEntry.decisionBranch = 27;
                mixedEntry.decision = "conflict_modified_then_keep_remote";
                keptFolder.add(getParentFolder(key));
              } else {
                mixedEntry.decisionBranch = 10;
                mixedEntry.decision = "local_is_modified_then_push";
                keptFolder.add(getParentFolder(key));
              }
            } else {
              throw Error(
                `local is modified (branch 10) but size larger than ${skipSizeLargerThan}, don't know what to do: ${JSON.stringify(
                  mixedEntry
                )}`
              );
            }
          } else if (!localEqualPrevSync && !remoteEqualPrevSync) {
            // If both compare False (Didn't exist means both are new. Both exist but don't compare means both are modified)
            if (prevSync === undefined) {
              // Didn't exist means both are new
              if (syncDirection === "bidirectional") {
                if (conflictAction === "keep_newer") {
                  if (
                    (local.mtimeCli ?? local.mtimeSvr ?? 0) >=
                    (remote.mtimeCli ?? remote.mtimeSvr ?? 0)
                  ) {
                    mixedEntry.decisionBranch = 11;
                    mixedEntry.decision = "conflict_created_then_keep_local";
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 12;
                    mixedEntry.decision = "conflict_created_then_keep_remote";
                    keptFolder.add(getParentFolder(key));
                  }
                } else if (conflictAction === "keep_larger") {
                  if (local.sizeEnc! >= remote.sizeEnc!) {
                    mixedEntry.decisionBranch = 13;
                    mixedEntry.decision = "conflict_created_then_keep_local";
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 14;
                    mixedEntry.decision = "conflict_created_then_keep_remote";
                    keptFolder.add(getParentFolder(key));
                  }
                } else {
                  mixedEntry.decisionBranch = 15;
                  mixedEntry.decision = "conflict_created_then_keep_both";
                  keptFolder.add(getParentFolder(key));
                }
              } else if (syncDirection === "incremental_pull_only") {
                mixedEntry.decisionBranch = 22;
                mixedEntry.decision = "conflict_created_then_keep_remote";
                keptFolder.add(getParentFolder(key));
              } else if (syncDirection === "incremental_push_only") {
                mixedEntry.decisionBranch = 23;
                mixedEntry.decision = "conflict_created_then_keep_local";
                keptFolder.add(getParentFolder(key));
              } else {
                throw Error(
                  `no idea how to deal with syncDirection=${syncDirection} while conflict created`
                );
              }
            } else {
              // Both exist but don't compare means both are modified
              if (syncDirection === "bidirectional") {
                if (conflictAction === "keep_newer") {
                  if (
                    (local.mtimeCli ?? local.mtimeSvr ?? 0) >=
                    (remote.mtimeCli ?? remote.mtimeSvr ?? 0)
                  ) {
                    mixedEntry.decisionBranch = 16;
                    mixedEntry.decision = "conflict_modified_then_keep_local";
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 17;
                    mixedEntry.decision = "conflict_modified_then_keep_remote";
                    keptFolder.add(getParentFolder(key));
                  }
                } else if (conflictAction === "keep_larger") {
                  if (local.sizeEnc! >= remote.sizeEnc!) {
                    mixedEntry.decisionBranch = 18;
                    mixedEntry.decision = "conflict_modified_then_keep_local";
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 19;
                    mixedEntry.decision = "conflict_modified_then_keep_remote";
                    keptFolder.add(getParentFolder(key));
                  }
                } else {
                  mixedEntry.decisionBranch = 20;
                  mixedEntry.decision = "conflict_modified_then_keep_both";
                  keptFolder.add(getParentFolder(key));
                }
              } else if (syncDirection === "incremental_pull_only") {
                mixedEntry.decisionBranch = 24;
                mixedEntry.decision = "conflict_modified_then_keep_remote";
                keptFolder.add(getParentFolder(key));
              } else if (syncDirection === "incremental_push_only") {
                mixedEntry.decisionBranch = 25;
                mixedEntry.decision = "conflict_modified_then_keep_local";
                keptFolder.add(getParentFolder(key));
              } else {
                throw Error(
                  `no idea how to deal with syncDirection=${syncDirection} while conflict modified`
                );
              }
            }
          } else {
            // Both compare true.
            // This is likely because of the mtimeCli and mtimeSvr tricks.
            // The result should be equal!!!
            mixedEntry.decisionBranch = 21;
            mixedEntry.decision = "equal";
            keptFolder.add(getParentFolder(key));
          }
        }
      } else if (local === undefined && remote !== undefined) {
        // A is missing
        if (prevSync === undefined) {
          // if B is not in the previous list, B is new
          if (
            skipSizeLargerThan <= 0 ||
            remote.sizeEnc! <= skipSizeLargerThan
          ) {
            if (syncDirection === "incremental_push_only") {
              mixedEntry.decisionBranch = 28;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 3;
              mixedEntry.decision = "remote_is_created_then_pull";
              keptFolder.add(getParentFolder(key));
            }
          } else {
            throw Error(
              `remote is created (branch 3) but size larger than ${skipSizeLargerThan}, don't know what to do: ${JSON.stringify(
                mixedEntry
              )}`
            );
          }
        } else if (
          (prevSync.mtimeSvr === remote.mtimeCli ||
            prevSync.mtimeSvr === remote.mtimeSvr) &&
          prevSync.sizeEnc === remote.sizeEnc
        ) {
          // if B is in the previous list and UNMODIFIED, B has been deleted by A
          if (syncDirection === "incremental_push_only") {
            mixedEntry.decisionBranch = 29;
            mixedEntry.decision = "conflict_created_then_do_nothing";
            keptFolder.add(getParentFolder(key));
          } else if (syncDirection === "incremental_pull_only") {
            mixedEntry.decisionBranch = 35;
            mixedEntry.decision = "conflict_created_then_keep_remote";
            keptFolder.add(getParentFolder(key));
          } else {
            mixedEntry.decisionBranch = 4;
            mixedEntry.decision = "local_is_deleted_thus_also_delete_remote";
          }
        } else {
          // if B is in the previous list and MODIFIED, B has been deleted by A but modified by B
          if (
            skipSizeLargerThan <= 0 ||
            remote.sizeEnc! <= skipSizeLargerThan
          ) {
            if (syncDirection === "incremental_push_only") {
              mixedEntry.decisionBranch = 30;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 5;
              mixedEntry.decision = "remote_is_modified_then_pull";
              keptFolder.add(getParentFolder(key));
            }
          } else {
            throw Error(
              `remote is modified (branch 5) but size larger than ${skipSizeLargerThan}, don't know what to do: ${JSON.stringify(
                mixedEntry
              )}`
            );
          }
        }
      } else if (local !== undefined && remote === undefined) {
        // B is missing

        if (prevSync === undefined) {
          // if A is not in the previous list, A is new
          if (skipSizeLargerThan <= 0 || local.sizeEnc! <= skipSizeLargerThan) {
            if (syncDirection === "incremental_pull_only") {
              mixedEntry.decisionBranch = 31;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 6;
              mixedEntry.decision = "local_is_created_then_push";
              keptFolder.add(getParentFolder(key));
            }
          } else {
            throw Error(
              `local is created (branch 6) but size larger than ${skipSizeLargerThan}, don't know what to do: ${JSON.stringify(
                mixedEntry
              )}`
            );
          }
        } else if (
          (prevSync.mtimeSvr === local.mtimeCli ||
            prevSync.mtimeCli === local.mtimeCli) &&
          prevSync.sizeEnc === local.sizeEnc
        ) {
          // if A is in the previous list and UNMODIFIED, A has been deleted by B
          if (syncDirection === "incremental_push_only") {
            mixedEntry.decisionBranch = 32;
            mixedEntry.decision = "conflict_created_then_keep_local";
          } else if (syncDirection === "incremental_pull_only") {
            mixedEntry.decisionBranch = 33;
            mixedEntry.decision = "conflict_created_then_do_nothing";
          } else {
            mixedEntry.decisionBranch = 7;
            mixedEntry.decision = "remote_is_deleted_thus_also_delete_local";
          }
        } else {
          // if A is in the previous list and MODIFIED, A has been deleted by B but modified by A
          if (skipSizeLargerThan <= 0 || local.sizeEnc! <= skipSizeLargerThan) {
            if (syncDirection === "incremental_pull_only") {
              mixedEntry.decisionBranch = 34;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 8;
              mixedEntry.decision = "local_is_modified_then_push";
              keptFolder.add(getParentFolder(key));
            }
          } else {
            throw Error(
              `local is modified (branch 8) but size larger than ${skipSizeLargerThan}, don't know what to do: ${JSON.stringify(
                mixedEntry
              )}`
            );
          }
        }
      } else {
        throw Error(
          `should not reach branch -1 while getting sync plan: ${JSON.stringify(
            mixedEntry
          )}`
        );
      }

      if (mixedEntry.decision === undefined) {
        throw Error(
          `unexpectedly no decision of file in the end: ${JSON.stringify(
            mixedEntry
          )}`
        );
      }
    }
  }

  keptFolder.delete("/");
  keptFolder.delete("");
  if (keptFolder.size > 0) {
    throw Error(`unexpectedly keptFolder no decisions: ${[...keptFolder]}`);
  }

  return mixedEntityMappings;
};

const splitThreeStepsOnEntityMappings = (
  mixedEntityMappings: Record<string, MixedEntity>
) => {
  type StepArrayType = MixedEntity[] | undefined | null;
  const folderCreationOps: StepArrayType[] = [];
  const deletionOps: StepArrayType[] = [];
  const uploadDownloads: StepArrayType[] = [];

  // from long(deep) to short(shadow)
  const sortedKeys = Object.keys(mixedEntityMappings).sort(
    (k1, k2) => k2.length - k1.length
  );

  let allFilesCount = 0; // how many files in entities
  let realModifyDeleteCount = 0; // how many files to be modified / deleted
  let realTotalCount = 0; // how many files to be delt with

  for (let i = 0; i < sortedKeys.length; ++i) {
    const key = sortedKeys[i];
    const val = mixedEntityMappings[key];

    if (!key.endsWith("/")) {
      allFilesCount += 1;
    }

    if (
      val.decision === "equal" ||
      val.decision === "conflict_created_then_do_nothing" ||
      val.decision === "folder_existed_both_then_do_nothing" ||
      val.decision === "folder_to_skip"
    ) {
      // pass
    } else if (
      val.decision === "folder_existed_local_then_also_create_remote" ||
      val.decision === "folder_existed_remote_then_also_create_local" ||
      val.decision === "folder_to_be_created"
    ) {
      // console.debug(`splitting folder: key=${key},val=${JSON.stringify(val)}`);
      const level = atWhichLevel(key);
      // console.debug(`atWhichLevel: ${level}`);
      const k = folderCreationOps[level - 1];
      if (k === undefined || k === null) {
        folderCreationOps[level - 1] = [val];
      } else {
        k.push(val);
      }
      realTotalCount += 1;
    } else if (
      val.decision === "only_history" ||
      val.decision === "local_is_deleted_thus_also_delete_remote" ||
      val.decision === "remote_is_deleted_thus_also_delete_local" ||
      val.decision === "folder_to_be_deleted"
    ) {
      const level = atWhichLevel(key);
      const k = deletionOps[level - 1];
      if (k === undefined || k === null) {
        deletionOps[level - 1] = [val];
      } else {
        k.push(val);
      }
      realTotalCount += 1;

      if (val.decision.startsWith("deleted")) {
        realModifyDeleteCount += 1;
      }
    } else if (
      val.decision === "local_is_modified_then_push" ||
      val.decision === "remote_is_modified_then_pull" ||
      val.decision === "local_is_created_then_push" ||
      val.decision === "remote_is_created_then_pull" ||
      val.decision === "conflict_created_then_keep_local" ||
      val.decision === "conflict_created_then_keep_remote" ||
      val.decision === "conflict_created_then_keep_both" ||
      val.decision === "conflict_modified_then_keep_local" ||
      val.decision === "conflict_modified_then_keep_remote" ||
      val.decision === "conflict_modified_then_keep_both"
    ) {
      if (
        uploadDownloads.length === 0 ||
        uploadDownloads[0] === undefined ||
        uploadDownloads[0] === null
      ) {
        uploadDownloads[0] = [val];
      } else {
        uploadDownloads[0].push(val); // only one level is needed here
      }
      realTotalCount += 1;

      if (
        val.decision.startsWith("modified") ||
        val.decision.startsWith("conflict")
      ) {
        realModifyDeleteCount += 1;
      }
    } else {
      throw Error(`unknown decision ${val.decision} for ${key}`);
    }
  }

  // the deletionOps should be run from max level to min level
  // right now it is sorted by level from min to max (NOT length of key!)
  // so we need to reverse it!
  deletionOps.reverse(); // inplace reverse

  return {
    folderCreationOps: folderCreationOps,
    deletionOps: deletionOps,
    uploadDownloads: uploadDownloads,
    allFilesCount: allFilesCount,
    realModifyDeleteCount: realModifyDeleteCount,
    realTotalCount: realTotalCount,
  };
};

const dispatchOperationToActualV3 = async (
  key: string,
  vaultRandomID: string,
  profileID: string,
  r: MixedEntity,
  client: RemoteClient,
  db: InternalDBs,
  vault: Vault,
  localDeleteFunc: any,
  cipher: Cipher
) => {
  // console.debug(
  //   `inside dispatchOperationToActualV3, key=${key}, r=${JSON.stringify(
  //     r,
  //     null,
  //     2
  //   )}`
  // );
  if (r.decision === "only_history") {
    clearPrevSyncRecordByVaultAndProfile(db, vaultRandomID, profileID, key);
  } else if (
    r.decision === "equal" ||
    r.decision === "conflict_created_then_do_nothing" ||
    r.decision === "folder_to_skip" ||
    r.decision === "folder_existed_both_then_do_nothing"
  ) {
    // pass
  } else if (
    r.decision === "local_is_modified_then_push" ||
    r.decision === "local_is_created_then_push" ||
    r.decision === "folder_existed_local_then_also_create_remote" ||
    r.decision === "conflict_created_then_keep_local" ||
    r.decision === "conflict_modified_then_keep_local"
  ) {
    if (
      client.serviceType === "onedrive" &&
      r.local!.size === 0 &&
      cipher.isPasswordEmpty()
    ) {
      // special treatment for empty files for OneDrive
      // TODO: it's ugly, any other way?
      // special treatment for OneDrive: do nothing, skip empty file without encryption
      // if it's empty folder, or it's encrypted file/folder, it continues to be uploaded.
    } else {
      // console.debug(`before upload in sync, r=${JSON.stringify(r, null, 2)}`);
      const { entity, mtimeCli } = await client.uploadToRemote(
        r.key,
        vault,
        false,
        cipher,
        r.local!.keyEnc
      );
      await decryptRemoteEntityInplace(entity, cipher);
      await fullfillMTimeOfRemoteEntityInplace(entity, mtimeCli);
      await upsertPrevSyncRecordByVaultAndProfile(
        db,
        vaultRandomID,
        profileID,
        entity
      );
    }
  } else if (
    r.decision === "remote_is_modified_then_pull" ||
    r.decision === "remote_is_created_then_pull" ||
    r.decision === "conflict_created_then_keep_remote" ||
    r.decision === "conflict_modified_then_keep_remote" ||
    r.decision === "folder_existed_remote_then_also_create_local"
  ) {
    await mkdirpInVault(r.key, vault);
    await client.downloadFromRemote(
      r.key,
      vault,
      r.remote!.mtimeCli!,
      cipher,
      r.remote!.keyEnc
    );
    await upsertPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.remote!
    );
  } else if (r.decision === "local_is_deleted_thus_also_delete_remote") {
    // local is deleted, we need to delete remote now
    await client.deleteFromRemote(r.key, cipher, r.remote!.keyEnc);
    await clearPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.key
    );
  } else if (r.decision === "remote_is_deleted_thus_also_delete_local") {
    // remote is deleted, we need to delete local now
    await localDeleteFunc(r.key);
    await clearPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.key
    );
  } else if (
    r.decision === "conflict_created_then_keep_both" ||
    r.decision === "conflict_modified_then_keep_both"
  ) {
    throw Error(`${r.decision} not implemented yet: ${JSON.stringify(r)}`);
  } else if (r.decision === "folder_to_be_created") {
    await mkdirpInVault(r.key, vault);
    const { entity, mtimeCli } = await client.uploadToRemote(
      r.key,
      vault,
      false,
      cipher,
      r.local!.keyEnc
    );
    // we need to decrypt the key!!!
    await decryptRemoteEntityInplace(entity, cipher);
    await fullfillMTimeOfRemoteEntityInplace(entity, mtimeCli);
    await upsertPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      entity
    );
  } else if (r.decision === "folder_to_be_deleted") {
    await localDeleteFunc(r.key);
    await client.deleteFromRemote(r.key, cipher, r.remote!.keyEnc);
    await clearPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.key
    );
  } else {
    throw Error(`don't know how to dispatch decision: ${JSON.stringify(r)}`);
  }
};

export const doActualSync = async (
  mixedEntityMappings: Record<string, MixedEntity>,
  client: RemoteClient,
  vaultRandomID: string,
  profileID: string,
  vault: Vault,
  cipher: Cipher,
  concurrency: number,
  localDeleteFunc: any,
  protectModifyPercentage: number,
  getProtectModifyPercentageErrorStrFunc: any,
  callbackSyncProcess: any,
  db: InternalDBs
) => {
  console.debug(`concurrency === ${concurrency}`);
  const {
    folderCreationOps,
    deletionOps,
    uploadDownloads,
    allFilesCount,
    realModifyDeleteCount,
    realTotalCount,
  } = splitThreeStepsOnEntityMappings(mixedEntityMappings);
  // console.debug(`folderCreationOps: ${JSON.stringify(folderCreationOps)}`);
  // console.debug(`deletionOps: ${JSON.stringify(deletionOps)}`);
  // console.debug(`uploadDownloads: ${JSON.stringify(uploadDownloads)}`);
  console.debug(`allFilesCount: ${allFilesCount}`);
  console.debug(`realModifyDeleteCount: ${realModifyDeleteCount}`);
  console.debug(`realTotalCount: ${realTotalCount}`);

  console.debug(`protectModifyPercentage: ${protectModifyPercentage}`);

  if (
    protectModifyPercentage >= 0 &&
    realModifyDeleteCount >= 0 &&
    allFilesCount > 0
  ) {
    if (
      realModifyDeleteCount * 100 >=
      allFilesCount * protectModifyPercentage
    ) {
      const errorStr: string = getProtectModifyPercentageErrorStrFunc(
        protectModifyPercentage,
        realModifyDeleteCount,
        allFilesCount
      );

      throw Error(errorStr);
    }
  }

  const nested = [folderCreationOps, deletionOps, uploadDownloads];
  const logTexts = [
    `1. create all folders from shadowest to deepest`,
    `2. delete files and folders from deepest to shadowest`,
    `3. upload or download files in parallel, with the desired concurrency=${concurrency}`,
  ];

  let realCounter = 0;
  for (let i = 0; i < nested.length; ++i) {
    console.debug(logTexts[i]);

    const operations = nested[i];
    // console.debug(`curr operations=${JSON.stringify(operations, null, 2)}`);

    for (let j = 0; j < operations.length; ++j) {
      const singleLevelOps = operations[j];
      console.debug(
        `singleLevelOps=${JSON.stringify(singleLevelOps, null, 2)}`
      );
      if (singleLevelOps === undefined || singleLevelOps === null) {
        continue;
      }

      const queue = new PQueue({ concurrency: concurrency, autoStart: true });
      const potentialErrors: Error[] = [];
      let tooManyErrors = false;

      for (let k = 0; k < singleLevelOps.length; ++k) {
        const val = singleLevelOps[k];
        const key = val.key;

        const fn = async () => {
          console.debug(
            `start syncing "${key}" with plan ${JSON.stringify(val)}`
          );

          if (callbackSyncProcess !== undefined) {
            await callbackSyncProcess(
              realCounter,
              realTotalCount,
              key,
              val.decision
            );

            realCounter += 1;
          }

          await dispatchOperationToActualV3(
            key,
            vaultRandomID,
            profileID,
            val,
            client,
            db,
            vault,
            localDeleteFunc,
            cipher
          );

          console.debug(`finished ${key}`);
        };

        queue.add(fn).catch((e) => {
          const msg = `${key}: ${e.message}`;
          potentialErrors.push(new Error(msg));
          if (potentialErrors.length >= 3) {
            tooManyErrors = true;
            queue.pause();
            queue.clear();
          }
        });
      }

      await queue.onIdle();

      if (potentialErrors.length > 0) {
        if (tooManyErrors) {
          potentialErrors.push(
            new Error("too many errors, stop the remaining tasks")
          );
        }
        throw new AggregateError(potentialErrors);
      }
    }
  }
};
