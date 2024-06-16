// biome-ignore lint/suspicious/noShadowRestrictedNames: <explanation>
import AggregateError from "aggregate-error";
import PQueue from "p-queue";
import XRegExp from "xregexp";
import type {
  ConflictActionType,
  EmptyFolderCleanType,
  Entity,
  MixedEntity,
  RemotelySavePluginSettings,
  SUPPORTED_SERVICES_TYPE,
  SyncDirectionType,
  SyncTriggerSourceType,
} from "../../src/baseTypes";
import { copyFile, copyFileOrFolder, copyFolder } from "../../src/copyLogic";
import type { FakeFs } from "../../src/fsAll";
import type { FakeFsEncrypt } from "../../src/fsEncrypt";
import {
  type InternalDBs,
  clearPrevSyncRecordByVaultAndProfile,
  getAllPrevSyncRecordsByVaultAndProfile,
  insertSyncPlanRecordByVault,
  upsertPrevSyncRecordByVaultAndProfile,
} from "../../src/localdb";
import {
  DEFAULT_FILE_NAME_FOR_METADATAONREMOTE,
  DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2,
} from "../../src/metadataOnRemote";
import {
  atWhichLevel,
  getParentFolder,
  isHiddenPath,
  isSpecialFolderNameToSkip,
  roughSizeOfObject,
  unixTimeToStr,
} from "../../src/misc";
import type { Profiler } from "../../src/profiler";
import { checkProRunnableAndFixInplace } from "./account";
import { duplicateFile, isMergable, mergeFile } from "./conflictLogic";
import {
  clearFileContentHistoryByVaultAndProfile,
  getFileContentHistoryByVaultAndProfile,
  upsertFileContentHistoryByVaultAndProfile,
} from "./localdb";

const copyEntityAndFixTimeFormat = (
  src: Entity,
  serviceType: SUPPORTED_SERVICES_TYPE
) => {
  const result = Object.assign({}, src);
  if (result.mtimeCli !== undefined) {
    if (result.mtimeCli === 0) {
      result.mtimeCli = undefined;
    } else {
      if (serviceType === "s3" || serviceType === "dropbox") {
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
      if (serviceType === "s3" || serviceType === "dropbox") {
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
      if (serviceType === "s3" || serviceType === "dropbox") {
        // round to second instead of millisecond
        result.prevSyncTime = Math.floor(result.prevSyncTime / 1000.0) * 1000;
      }
      result.prevSyncTimeFmt = unixTimeToStr(result.prevSyncTime);
    }
  }

  return result;
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

const isInsideObsFolder = (x: string, configDir: string) => {
  if (!configDir.startsWith(".")) {
    throw Error(`configDir should starts with . but we get ${configDir}`);
  }
  return x === configDir || x.startsWith(`${configDir}/`);
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
    key === "/" ||
    key === DEFAULT_FILE_NAME_FOR_METADATAONREMOTE ||
    key === DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2
  );
};

export type SyncPlanType = Record<string, MixedEntity>;

const ensembleMixedEnties = async (
  localEntityList: Entity[],
  prevSyncEntityList: Entity[],
  remoteEntityList: Entity[],

  syncConfigDir: boolean,
  configDir: string,
  syncUnderscoreItems: boolean,
  ignorePaths: string[],
  fsEncrypt: FakeFsEncrypt,
  serviceType: SUPPORTED_SERVICES_TYPE,

  profiler: Profiler | undefined
): Promise<SyncPlanType> => {
  profiler?.addIndent();
  profiler?.insert("ensembleMixedEnties: enter");
  profiler?.insertSize("sizeof localEntityList", localEntityList);
  profiler?.insertSize("sizeof prevSyncEntityList", prevSyncEntityList);
  profiler?.insertSize("sizeof remoteEntityList", remoteEntityList);

  const finalMappings: SyncPlanType = {};

  // remote has to be first
  for (const remote of remoteEntityList) {
    const remoteCopied = ensureMTimeOfRemoteEntityValid(
      copyEntityAndFixTimeFormat(remote, serviceType)
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

  profiler?.insert("ensembleMixedEnties: finish remote");
  profiler?.insertSize("sizeof finalMappings", finalMappings);

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

      // TODO: abstraction leaking?
      const prevSyncCopied = await fsEncrypt.encryptEntity(
        copyEntityAndFixTimeFormat(prevSync, serviceType)
      );
      if (finalMappings.hasOwnProperty(key)) {
        finalMappings[key].prevSync = prevSyncCopied;
      } else {
        finalMappings[key] = {
          key: key,
          prevSync: prevSyncCopied,
        };
      }
    }
  }

  profiler?.insert("ensembleMixedEnties: finish prevSync");
  profiler?.insertSize("sizeof finalMappings", finalMappings);

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

    // TODO: abstraction leaking?
    const localCopied = await fsEncrypt.encryptEntity(
      copyEntityAndFixTimeFormat(local, serviceType)
    );
    if (finalMappings.hasOwnProperty(key)) {
      finalMappings[key].local = localCopied;
    } else {
      finalMappings[key] = {
        key: key,
        local: localCopied,
      };
    }
  }

  profiler?.insert("ensembleMixedEnties: finish local");
  profiler?.insertSize("sizeof finalMappings", finalMappings);

  // console.debug("in the end of ensembleMixedEnties, finalMappings is:");
  // console.debug(finalMappings);

  profiler?.insert("ensembleMixedEnties: exit");
  profiler?.removeIndent();
  return finalMappings;
};

/**
 * Heavy lifting.
 * Basically follow the sync algorithm of https://github.com/Jwink3101/syncrclone
 * Also deal with syncDirection which makes it more complicated
 */
const getSyncPlanInplace = async (
  mixedEntityMappings: Record<string, MixedEntity>,
  skipSizeLargerThan: number,
  conflictAction: ConflictActionType,
  syncDirection: SyncDirectionType,
  profiler: Profiler | undefined,
  settings: RemotelySavePluginSettings,
  triggerSource: SyncTriggerSourceType
) => {
  profiler?.addIndent();
  profiler?.insert("getSyncPlanInplace: enter");
  // from long(deep) to short(shadow)
  const sortedKeys = Object.keys(mixedEntityMappings).sort(
    (k1, k2) => k2.length - k1.length
  );
  profiler?.insert("getSyncPlanInplace: finish sorting");
  profiler?.insertSize("sizeof sortedKeys", sortedKeys);

  const keptFolder = new Set<string>();

  for (let i = 0; i < sortedKeys.length; ++i) {
    if (i % 100 === 0) {
      profiler?.insertSize(
        `sizeof sortedKeys in the beginning of i=${i}`,
        mixedEntityMappings
      );
    }
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
          mixedEntry.change = false;
        } else if (local !== undefined && remote === undefined) {
          if (
            syncDirection === "incremental_pull_only" ||
            syncDirection === "incremental_pull_and_delete_only"
          ) {
            mixedEntry.decisionBranch = 107;
            mixedEntry.decision = "folder_to_skip";
            mixedEntry.change = false;
          } else {
            mixedEntry.decisionBranch = 102;
            mixedEntry.decision =
              "folder_existed_local_then_also_create_remote";
            mixedEntry.change = true;
          }
        } else if (local === undefined && remote !== undefined) {
          if (
            syncDirection === "incremental_push_only" ||
            syncDirection === "incremental_push_and_delete_only"
          ) {
            mixedEntry.decisionBranch = 108;
            mixedEntry.decision = "folder_to_skip";
            mixedEntry.change = false;
          } else {
            mixedEntry.decisionBranch = 103;
            mixedEntry.decision =
              "folder_existed_remote_then_also_create_local";
            mixedEntry.change = true;
          }
        } else {
          // why?? how??
          mixedEntry.decisionBranch = 104;
          mixedEntry.decision = "folder_to_be_created";
          mixedEntry.change = true;
        }
        keptFolder.delete(key); // no need to save it in the Set later
      } else {
        if (local !== undefined && remote !== undefined) {
          // both exist, do nothing
          mixedEntry.decisionBranch = 121;
          mixedEntry.decision = "folder_existed_both_then_do_nothing";
          mixedEntry.change = false;
          keptFolder.add(getParentFolder(key));
        } else if (local !== undefined && remote === undefined) {
          if (prevSync !== undefined) {
            // then the folder is deleted on remote
            if (
              syncDirection === "incremental_push_only" ||
              syncDirection === "incremental_push_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 122;
              mixedEntry.decision = "folder_to_skip";
              keptFolder.add(getParentFolder(key));
              mixedEntry.change = false;
            } else if (syncDirection === "incremental_pull_only") {
              mixedEntry.decisionBranch = 123;
              mixedEntry.decision = "folder_to_skip";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else if (syncDirection === "incremental_pull_and_delete_only") {
              mixedEntry.decisionBranch = 135;
              mixedEntry.decision = "folder_to_be_deleted_on_local";
              mixedEntry.change = true;
            } else {
              // bidirectional
              mixedEntry.decisionBranch = 124;
              mixedEntry.decision = "folder_to_be_deleted_on_local";
              mixedEntry.change = true;
            }
          } else {
            // then the folder is created on local

            if (
              syncDirection === "incremental_push_only" ||
              syncDirection === "incremental_push_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 125;
              mixedEntry.decision =
                "folder_existed_local_then_also_create_remote";
              mixedEntry.change = true;
              keptFolder.add(getParentFolder(key));
            } else if (
              syncDirection === "incremental_pull_only" ||
              syncDirection === "incremental_pull_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 126;
              mixedEntry.decision = "folder_to_skip";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else {
              // bidirectional
              mixedEntry.decisionBranch = 127;
              mixedEntry.decision =
                "folder_existed_local_then_also_create_remote";
              mixedEntry.change = true;
              keptFolder.add(getParentFolder(key));
            }
          }
        } else if (local === undefined && remote !== undefined) {
          if (prevSync !== undefined) {
            // then the folder is deleted on local
            if (syncDirection === "incremental_push_only") {
              mixedEntry.decisionBranch = 128;
              mixedEntry.decision = "folder_to_skip";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else if (syncDirection === "incremental_push_and_delete_only") {
              mixedEntry.decisionBranch = 136;
              mixedEntry.decision = "folder_to_be_deleted_on_remote";
              mixedEntry.change = true;
            } else if (
              syncDirection === "incremental_pull_only" ||
              syncDirection === "incremental_pull_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 129;
              mixedEntry.decision = "folder_to_skip";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else {
              // bidirectional
              mixedEntry.decisionBranch = 130;
              mixedEntry.decision = "folder_to_be_deleted_on_remote";
              mixedEntry.change = true;
            }
          } else {
            // then the folder is created on remote
            if (
              syncDirection === "incremental_push_only" ||
              syncDirection === "incremental_push_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 131;
              mixedEntry.decision = "folder_to_skip";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else if (
              syncDirection === "incremental_pull_only" ||
              syncDirection === "incremental_pull_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 132;
              mixedEntry.decision =
                "folder_existed_remote_then_also_create_local";
              mixedEntry.change = true;
              keptFolder.add(getParentFolder(key));
            } else {
              // bidirectional
              mixedEntry.decisionBranch = 133;
              mixedEntry.decision =
                "folder_existed_remote_then_also_create_local";
              mixedEntry.change = true;
              keptFolder.add(getParentFolder(key));
            }
          }
        } else {
          // local === undefined && remote === undefined
          // no folder to delete or create, do nothing
          mixedEntry.decisionBranch = 134;
          mixedEntry.decision = "folder_to_skip";
          mixedEntry.change = false;
        }
      }
    } else {
      // file

      if (local === undefined && remote === undefined) {
        // both deleted, only in history
        mixedEntry.decisionBranch = 1;
        mixedEntry.decision = "only_history";
        mixedEntry.change = false;
      } else if (local !== undefined && remote !== undefined) {
        if (
          (local.mtimeCli === remote.mtimeCli ||
            local.mtimeCli === remote.mtimeSvr) &&
          local.sizeEnc === remote.sizeEnc
        ) {
          // completely equal / identical
          mixedEntry.decisionBranch = 2;
          mixedEntry.decision = "equal";
          mixedEntry.change = false;
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
              if (
                syncDirection === "incremental_push_only" ||
                syncDirection === "incremental_push_and_delete_only"
              ) {
                mixedEntry.decisionBranch = 26;
                mixedEntry.decision = "conflict_modified_then_keep_local";
                mixedEntry.change = true;
                keptFolder.add(getParentFolder(key));
              } else {
                mixedEntry.decisionBranch = 9;
                mixedEntry.decision = "remote_is_modified_then_pull";
                mixedEntry.change = true;
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
              if (
                syncDirection === "incremental_pull_only" ||
                syncDirection === "incremental_pull_and_delete_only"
              ) {
                mixedEntry.decisionBranch = 27;
                mixedEntry.decision = "conflict_modified_then_keep_remote";
                mixedEntry.change = true;
                keptFolder.add(getParentFolder(key));
              } else {
                mixedEntry.decisionBranch = 10;
                mixedEntry.decision = "local_is_modified_then_push";
                mixedEntry.change = true;
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
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 12;
                    mixedEntry.decision = "conflict_created_then_keep_remote";
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  }
                } else if (conflictAction === "keep_larger") {
                  if (local.sizeEnc! >= remote.sizeEnc!) {
                    mixedEntry.decisionBranch = 13;
                    mixedEntry.decision = "conflict_created_then_keep_local";
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 14;
                    mixedEntry.decision = "conflict_created_then_keep_remote";
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  }
                } else if (conflictAction === "smart_conflict") {
                  // try merge!
                  mixedEntry.decisionBranch = 302;
                  mixedEntry.decision = "conflict_created_then_smart_conflict";
                  mixedEntry.change = true;
                  keptFolder.add(getParentFolder(key));
                }
              } else if (
                syncDirection === "incremental_pull_only" ||
                syncDirection === "incremental_pull_and_delete_only"
              ) {
                mixedEntry.decisionBranch = 22;
                mixedEntry.decision = "conflict_created_then_keep_remote";
                mixedEntry.change = true;
                keptFolder.add(getParentFolder(key));
              } else if (
                syncDirection === "incremental_push_only" ||
                syncDirection === "incremental_push_and_delete_only"
              ) {
                mixedEntry.decisionBranch = 23;
                mixedEntry.decision = "conflict_created_then_keep_local";
                mixedEntry.change = true;
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
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 17;
                    mixedEntry.decision = "conflict_modified_then_keep_remote";
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  }
                } else if (conflictAction === "keep_larger") {
                  if (local.sizeEnc! >= remote.sizeEnc!) {
                    mixedEntry.decisionBranch = 18;
                    mixedEntry.decision = "conflict_modified_then_keep_local";
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  } else {
                    mixedEntry.decisionBranch = 19;
                    mixedEntry.decision = "conflict_modified_then_keep_remote";
                    mixedEntry.change = true;
                    keptFolder.add(getParentFolder(key));
                  }
                } else if (conflictAction === "smart_conflict") {
                  // yeah, try to merge them!
                  mixedEntry.decisionBranch = 301;
                  mixedEntry.decision = "conflict_modified_then_smart_conflict";
                  mixedEntry.change = true;
                  keptFolder.add(getParentFolder(key));
                }
              } else if (
                syncDirection === "incremental_pull_only" ||
                syncDirection === "incremental_pull_and_delete_only"
              ) {
                mixedEntry.decisionBranch = 24;
                mixedEntry.decision = "conflict_modified_then_keep_remote";
                mixedEntry.change = true;
                keptFolder.add(getParentFolder(key));
              } else if (
                syncDirection === "incremental_push_only" ||
                syncDirection === "incremental_push_and_delete_only"
              ) {
                mixedEntry.decisionBranch = 25;
                mixedEntry.decision = "conflict_modified_then_keep_local";
                mixedEntry.change = true;
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
            mixedEntry.change = false;
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
            if (
              syncDirection === "incremental_push_only" ||
              syncDirection === "incremental_push_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 28;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 3;
              mixedEntry.decision = "remote_is_created_then_pull";
              mixedEntry.change = true;
              keptFolder.add(getParentFolder(key));
            }
          } else {
            mixedEntry.decisionBranch = 36;
            mixedEntry.decision = "remote_is_created_too_large_then_do_nothing";
            mixedEntry.change = false;
            keptFolder.add(getParentFolder(key));
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
            mixedEntry.change = false;
            keptFolder.add(getParentFolder(key));
          } else if (syncDirection === "incremental_push_and_delete_only") {
            mixedEntry.decisionBranch = 38;
            mixedEntry.decision = "local_is_deleted_thus_also_delete_remote";
            mixedEntry.change = true;
          } else if (
            syncDirection === "incremental_pull_only" ||
            syncDirection === "incremental_pull_and_delete_only"
          ) {
            mixedEntry.decisionBranch = 35;
            mixedEntry.decision = "conflict_created_then_keep_remote";
            mixedEntry.change = true;
            keptFolder.add(getParentFolder(key));
          } else {
            mixedEntry.decisionBranch = 4;
            mixedEntry.decision = "local_is_deleted_thus_also_delete_remote";
            mixedEntry.change = true;
          }
        } else {
          // if B is in the previous list and MODIFIED, B has been deleted by A but modified by B
          if (
            skipSizeLargerThan <= 0 ||
            remote.sizeEnc! <= skipSizeLargerThan
          ) {
            if (
              syncDirection === "incremental_push_only" ||
              syncDirection === "incremental_push_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 30;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 5;
              mixedEntry.decision = "remote_is_modified_then_pull";
              mixedEntry.change = true;
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
            if (
              syncDirection === "incremental_pull_only" ||
              syncDirection === "incremental_pull_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 31;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 6;
              mixedEntry.decision = "local_is_created_then_push";
              mixedEntry.change = true;
              keptFolder.add(getParentFolder(key));
            }
          } else {
            mixedEntry.decisionBranch = 37;
            mixedEntry.decision = "local_is_created_too_large_then_do_nothing";
            mixedEntry.change = false;
            keptFolder.add(getParentFolder(key));
          }
        } else if (
          (prevSync.mtimeSvr === local.mtimeCli ||
            prevSync.mtimeCli === local.mtimeCli) &&
          prevSync.sizeEnc === local.sizeEnc
        ) {
          // if A is in the previous list and UNMODIFIED, A has been deleted by B
          if (
            syncDirection === "incremental_push_only" ||
            syncDirection === "incremental_push_and_delete_only"
          ) {
            mixedEntry.decisionBranch = 32;
            mixedEntry.decision = "conflict_created_then_keep_local";
            mixedEntry.change = true;
          } else if (syncDirection === "incremental_pull_only") {
            mixedEntry.decisionBranch = 33;
            mixedEntry.decision = "conflict_created_then_do_nothing";
            mixedEntry.change = false;
          } else if (syncDirection === "incremental_pull_and_delete_only") {
            mixedEntry.decisionBranch = 39;
            mixedEntry.decision = "remote_is_deleted_thus_also_delete_local";
            mixedEntry.change = true;
          } else {
            mixedEntry.decisionBranch = 7;
            mixedEntry.decision = "remote_is_deleted_thus_also_delete_local";
            mixedEntry.change = true;
          }
        } else {
          // if A is in the previous list and MODIFIED, A has been deleted by B but modified by A
          if (skipSizeLargerThan <= 0 || local.sizeEnc! <= skipSizeLargerThan) {
            if (
              syncDirection === "incremental_pull_only" ||
              syncDirection === "incremental_pull_and_delete_only"
            ) {
              mixedEntry.decisionBranch = 34;
              mixedEntry.decision = "conflict_created_then_do_nothing";
              mixedEntry.change = false;
              keptFolder.add(getParentFolder(key));
            } else {
              mixedEntry.decisionBranch = 8;
              mixedEntry.decision = "local_is_modified_then_push";
              mixedEntry.change = true;
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

  profiler?.insert("getSyncPlanInplace: finish looping");

  keptFolder.delete("/");
  keptFolder.delete("");
  if (keptFolder.size > 0) {
    throw Error(`unexpectedly keptFolder no decisions: ${[...keptFolder]}`);
  }

  // finally we want to make our life easier
  const currTime = Date.now();
  const currTimeFmt = unixTimeToStr(currTime);
  // because the path should not as / in the beginning,
  // we should be safe to add these keys:
  const sizeofmixedEntityMappings = roughSizeOfObject(mixedEntityMappings);
  mixedEntityMappings["/$@meta"] = {
    key: "/$@meta", // don't mess up with the types
    sideNotes: {
      version: "20240616 fs version",
      generateTime: currTime,
      generateTimeFmt: currTimeFmt,
      service: settings.serviceType,
      concurrency: settings.concurrency,
      hasPassword: settings.password !== "",
      syncConfigDir: settings.syncConfigDir,
      syncUnderscoreItems: settings.syncUnderscoreItems,
      skipSizeLargerThan: settings.skipSizeLargerThan,
      protectModifyPercentage: settings.protectModifyPercentage,
      conflictAction: conflictAction,
      syncDirection: syncDirection,
      triggerSource: triggerSource,
      sizeof: sizeofmixedEntityMappings,
    },
  };

  profiler?.insert("getSyncPlanInplace: exit");
  profiler?.insertSize(
    "sizeof mixedEntityMappings in the end of getSyncPlanInplace",
    mixedEntityMappings
  );
  profiler?.removeIndent();

  return mixedEntityMappings;
};

const splitFourStepsOnEntityMappings = (
  mixedEntityMappings: Record<string, MixedEntity>
) => {
  type StepArrayType = MixedEntity[] | undefined | null;
  const onlyMarkSyncedOps: StepArrayType[] = [];
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

    if (key === "/$@meta") {
      continue; // special
    }

    const val = mixedEntityMappings[key];

    if (!key.endsWith("/")) {
      allFilesCount += 1;
    }

    if (
      val.decision === "local_is_created_too_large_then_do_nothing" ||
      val.decision === "remote_is_created_too_large_then_do_nothing" ||
      val.decision === "folder_to_skip"
    ) {
      // pass
    } else if (
      val.decision === "equal" ||
      val.decision === "conflict_created_then_do_nothing" ||
      val.decision === "folder_existed_both_then_do_nothing"
    ) {
      if (
        onlyMarkSyncedOps.length === 0 ||
        onlyMarkSyncedOps[0] === undefined ||
        onlyMarkSyncedOps[0] === null
      ) {
        onlyMarkSyncedOps[0] = [val];
      } else {
        onlyMarkSyncedOps[0].push(val); // only one level is needed here
      }

      // don't need to update realTotalCount here
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
      val.decision === "folder_to_be_deleted_on_both" ||
      val.decision === "folder_to_be_deleted_on_local" ||
      val.decision === "folder_to_be_deleted_on_remote"
    ) {
      const level = atWhichLevel(key);
      const k = deletionOps[level - 1];
      if (k === undefined || k === null) {
        deletionOps[level - 1] = [val];
      } else {
        k.push(val);
      }
      realTotalCount += 1;

      if (
        val.decision.includes("deleted") &&
        !val.decision.includes("folder")
      ) {
        // only count files here, skip folder
        realModifyDeleteCount += 1;
      }
    } else if (
      val.decision === "local_is_modified_then_push" ||
      val.decision === "remote_is_modified_then_pull" ||
      val.decision === "local_is_created_then_push" ||
      val.decision === "remote_is_created_then_pull" ||
      val.decision === "conflict_created_then_keep_local" ||
      val.decision === "conflict_created_then_keep_remote" ||
      val.decision === "conflict_created_then_smart_conflict" ||
      val.decision === "conflict_modified_then_keep_local" ||
      val.decision === "conflict_modified_then_keep_remote" ||
      val.decision === "conflict_modified_then_smart_conflict"
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
        val.decision.includes("modified") ||
        val.decision.includes("conflict")
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
    onlyMarkSyncedOps: onlyMarkSyncedOps,
    folderCreationOps: folderCreationOps,
    deletionOps: deletionOps,
    uploadDownloads: uploadDownloads,
    allFilesCount: allFilesCount,
    realModifyDeleteCount: realModifyDeleteCount,
    realTotalCount: realTotalCount,
  };
};

const fullfillMTimeOfRemoteEntityInplace = (
  remote: Entity,
  mtimeCli?: number
) => {
  // TODO:
  // on 20240405, we find that dropbox's mtimeCli is not updated
  // if the content is not updated even the time is updated...
  // so we do not check remote.mtimeCli for now..
  if (
    mtimeCli !== undefined &&
    mtimeCli > 0 /* &&
    (remote.mtimeCli === undefined ||
      remote.mtimeCli <= 0 ||
      (remote.mtimeSvr !== undefined &&
        remote.mtimeSvr > 0 &&
        remote.mtimeCli >= remote.mtimeSvr))
    */
  ) {
    remote.mtimeCli = mtimeCli;
  }
  return remote;
};

const dispatchOperationToActualV3 = async (
  key: string,
  vaultRandomID: string,
  profileID: string,
  r: MixedEntity,
  fsLocal: FakeFs,
  fsEncrypt: FakeFsEncrypt,
  db: InternalDBs,
  conflictAction: ConflictActionType
) => {
  // console.debug(
  //   `inside dispatchOperationToActualV3, key=${key}, r=${JSON.stringify(
  //     r,
  //     null,
  //     2
  //   )}`
  // );
  if (r.decision === "only_history") {
    await clearPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      key
    );
    if (conflictAction === "smart_conflict") {
      await clearFileContentHistoryByVaultAndProfile(
        db,
        vaultRandomID,
        profileID,
        key
      );
    }
  } else if (
    r.decision === "local_is_created_too_large_then_do_nothing" ||
    r.decision === "remote_is_created_too_large_then_do_nothing" ||
    r.decision === "folder_to_skip"
  ) {
    // !! no actual sync being kept happens,
    // so no sync record here
    // pass
  } else if (
    r.decision === "equal" ||
    r.decision === "conflict_created_then_do_nothing" ||
    r.decision === "folder_existed_both_then_do_nothing"
  ) {
    // !! we MIGHT need to upsert the record,
    // so that next time we can determine the change delta

    if (r.prevSync !== undefined) {
      // if we have prevSync,
      // we don't need to update prevSync, because the record is already there!

      // but we might need to update content, because it's a new feature
      if (conflictAction === "smart_conflict") {
        if (isMergable(r.local!)) {
          const k = await getFileContentHistoryByVaultAndProfile(
            db,
            vaultRandomID,
            profileID,
            r.local!
          );
          if (k === null || k === undefined) {
            await upsertFileContentHistoryByVaultAndProfile(
              db,
              vaultRandomID,
              profileID,
              r.local!,
              await fsLocal.readFile(r.local!.keyRaw)
            );
          }
        }
      }
    } else {
      // if we don't have prevSync, we use remote entity AND local mtime
      // as if it is "uploaded"
      if (r.remote !== undefined) {
        let entity = r.remote;
        // TODO: abstract away the dirty hack
        entity = fullfillMTimeOfRemoteEntityInplace(entity, r.local?.mtimeCli);

        if (entity !== undefined) {
          await upsertPrevSyncRecordByVaultAndProfile(
            db,
            vaultRandomID,
            profileID,
            entity
          );
          if (conflictAction === "smart_conflict") {
            if (isMergable(entity)) {
              await upsertFileContentHistoryByVaultAndProfile(
                db,
                vaultRandomID,
                profileID,
                entity,
                await fsLocal.readFile(entity.keyRaw)
              );
            }
          }
        }
      }
    }
  } else if (
    r.decision === "local_is_modified_then_push" ||
    r.decision === "local_is_created_then_push" ||
    r.decision === "folder_existed_local_then_also_create_remote" ||
    r.decision === "conflict_created_then_keep_local" ||
    r.decision === "conflict_modified_then_keep_local"
  ) {
    // console.debug(`before upload in sync, r=${JSON.stringify(r, null, 2)}`);
    const mtimeCli = (await fsLocal.stat(r.key)).mtimeCli!;
    const { entity, content } = await copyFileOrFolder(
      r.key,
      fsLocal,
      fsEncrypt
    );
    // TODO: abstract away the dirty hack
    fullfillMTimeOfRemoteEntityInplace(entity, mtimeCli);
    // console.debug(`after fullfill, entity=${JSON.stringify(entity,null,2)}`)
    await upsertPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      entity
    );
    if (conflictAction === "smart_conflict") {
      if (isMergable(entity)) {
        await upsertFileContentHistoryByVaultAndProfile(
          db,
          vaultRandomID,
          profileID,
          entity,
          content!
        );
      }
    }
  } else if (
    r.decision === "remote_is_modified_then_pull" ||
    r.decision === "remote_is_created_then_pull" ||
    r.decision === "conflict_created_then_keep_remote" ||
    r.decision === "conflict_modified_then_keep_remote" ||
    r.decision === "folder_existed_remote_then_also_create_local"
  ) {
    let e1: Entity | undefined = undefined;
    let c1: ArrayBuffer | undefined = undefined;
    if (r.key.endsWith("/")) {
      await fsLocal.mkdir(r.key);
    } else {
      const { entity, content } = await copyFile(r.key, fsEncrypt, fsLocal);
      e1 = entity;
      c1 = content;
    }
    await upsertPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.remote!
    );
    if (conflictAction === "smart_conflict") {
      if (isMergable(r.remote!)) {
        await upsertFileContentHistoryByVaultAndProfile(
          db,
          vaultRandomID,
          profileID,
          r.remote!,
          c1! // always file, always has real value
        );
      }
    }
  } else if (r.decision === "local_is_deleted_thus_also_delete_remote") {
    // local is deleted, we need to delete remote now
    await fsEncrypt.rm(r.key);
    await clearPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.key
    );
    if (conflictAction === "smart_conflict") {
      if (isMergable(r.remote!)) {
        await clearFileContentHistoryByVaultAndProfile(
          db,
          vaultRandomID,
          profileID,
          r.key
        );
      }
    }
  } else if (r.decision === "remote_is_deleted_thus_also_delete_local") {
    // remote is deleted, we need to delete local now
    await fsLocal.rm(r.key);
    await clearPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.key
    );
    if (conflictAction === "smart_conflict") {
      if (isMergable(r.local!)) {
        await clearFileContentHistoryByVaultAndProfile(
          db,
          vaultRandomID,
          profileID,
          r.key
        );
      }
    }
  } else if (
    r.decision === "conflict_created_then_smart_conflict" ||
    r.decision === "conflict_modified_then_smart_conflict"
  ) {
    // heavy lifting
    if (isMergable(r.local!, r.remote!)) {
      const origContent = await getFileContentHistoryByVaultAndProfile(
        db,
        vaultRandomID,
        profileID,
        r.local!
      );
      // console.debug(`we get origContent:`)
      // console.debug(origContent)
      const { entity, content } = await mergeFile(
        r.key,
        fsLocal,
        fsEncrypt,
        origContent
      );
      await upsertPrevSyncRecordByVaultAndProfile(
        db,
        vaultRandomID,
        profileID,
        entity
      );
      await upsertFileContentHistoryByVaultAndProfile(
        db,
        vaultRandomID,
        profileID,
        entity,
        content
      );
    } else {
      // duplicate the files
      await clearPrevSyncRecordByVaultAndProfile(
        db,
        vaultRandomID,
        profileID,
        r.key
      );
      const mtimeCli = (await fsLocal.stat(r.key)).mtimeCli!;
      const { upload, download } = await duplicateFile(
        r.key,
        fsLocal,
        fsEncrypt,
        async (upload) => {
          // TODO: abstract away the dirty hack
          fullfillMTimeOfRemoteEntityInplace(upload, mtimeCli);
          await upsertPrevSyncRecordByVaultAndProfile(
            db,
            vaultRandomID,
            profileID,
            upload
          );
        },
        async (download) => {
          await upsertPrevSyncRecordByVaultAndProfile(
            db,
            vaultRandomID,
            profileID,
            download
          );
        }
      );
    }
  } else if (r.decision === "folder_to_be_created") {
    await fsLocal.mkdir(r.key);
    const { entity } = await copyFolder(r.key, fsLocal, fsEncrypt);
    await upsertPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      entity
    );
    // no need to record file content for folder here
  } else if (
    r.decision === "folder_to_be_deleted_on_both" ||
    r.decision === "folder_to_be_deleted_on_local" ||
    r.decision === "folder_to_be_deleted_on_remote"
  ) {
    if (
      r.decision === "folder_to_be_deleted_on_both" ||
      r.decision === "folder_to_be_deleted_on_local"
    ) {
      await fsLocal.rm(r.key);
    }
    if (
      r.decision === "folder_to_be_deleted_on_both" ||
      r.decision === "folder_to_be_deleted_on_remote"
    ) {
      await fsEncrypt.rm(r.key);
    }
    await clearPrevSyncRecordByVaultAndProfile(
      db,
      vaultRandomID,
      profileID,
      r.key
    );
    // no need to record file content for folder here
  } else {
    throw Error(`don't know how to dispatch decision: ${JSON.stringify(r)}`);
  }
};

export const doActualSync = async (
  mixedEntityMappings: Record<string, MixedEntity>,
  fsLocal: FakeFs,
  fsEncrypt: FakeFsEncrypt,
  vaultRandomID: string,
  profileID: string,
  concurrency: number,
  protectModifyPercentage: number,
  getProtectModifyPercentageErrorStrFunc: any,
  db: InternalDBs,
  profiler: Profiler | undefined,
  conflictAction: ConflictActionType,
  callbackSyncProcess?: any
) => {
  profiler?.addIndent();
  profiler?.insert("doActualSync: enter");
  console.debug(`concurrency === ${concurrency}`);
  const {
    onlyMarkSyncedOps,
    folderCreationOps,
    deletionOps,
    uploadDownloads,
    allFilesCount,
    realModifyDeleteCount,
    realTotalCount,
  } = splitFourStepsOnEntityMappings(mixedEntityMappings);
  // console.debug(`onlyMarkSyncedOps: ${JSON.stringify(onlyMarkSyncedOps)}`);
  // console.debug(`folderCreationOps: ${JSON.stringify(folderCreationOps)}`);
  // console.debug(`deletionOps: ${JSON.stringify(deletionOps)}`);
  // console.debug(`uploadDownloads: ${JSON.stringify(uploadDownloads)}`);
  console.debug(`allFilesCount: ${allFilesCount}`);
  console.debug(`realModifyDeleteCount: ${realModifyDeleteCount}`);
  console.debug(`realTotalCount: ${realTotalCount}`);
  profiler?.insert("doActualSync: finish splitting steps");

  profiler?.insertSize(
    "doActualSync: sizeof onlyMarkSyncedOps",
    onlyMarkSyncedOps
  );
  profiler?.insertSize(
    "doActualSync: sizeof folderCreationOps",
    folderCreationOps
  );
  profiler?.insertSize("doActualSync: sizeof realTotalCount", deletionOps);

  console.debug(`protectModifyPercentage: ${protectModifyPercentage}`);

  if (
    protectModifyPercentage >= 0 &&
    realModifyDeleteCount >= 0 &&
    allFilesCount > 0
  ) {
    if (
      protectModifyPercentage === 100 &&
      realModifyDeleteCount === allFilesCount
    ) {
      // special treatment for 100%
      // let it pass, we do nothing here
    } else if (
      realModifyDeleteCount * 100 >=
      allFilesCount * protectModifyPercentage
    ) {
      const errorStr: string = getProtectModifyPercentageErrorStrFunc(
        protectModifyPercentage,
        realModifyDeleteCount,
        allFilesCount
      );

      profiler?.insert("doActualSync: error branch");
      profiler?.removeIndent();
      throw Error(errorStr);
    }
  }

  const nested = [
    onlyMarkSyncedOps,
    folderCreationOps,
    deletionOps,
    uploadDownloads,
  ];
  const logTexts = [
    `1. record the items already being synced`,
    `2. create all folders from shadowest to deepest`,
    `3. delete files and folders from deepest to shadowest`,
    `4. upload or download files in parallel, with the desired concurrency=${concurrency}`,
  ];

  let realCounter = 0;
  for (let i = 0; i < nested.length; ++i) {
    profiler?.addIndent();
    profiler?.insert(`doActualSync: step ${i} start`);
    console.debug(logTexts[i]);

    const operations = nested[i];
    // console.debug(`curr operations=${JSON.stringify(operations, null, 2)}`);

    for (let j = 0; j < operations.length; ++j) {
      const singleLevelOps = operations[j];
      // console.debug(
      //   `singleLevelOps=${JSON.stringify(singleLevelOps, null, 2)}`
      // );
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
          // console.debug(
          //   `start syncing "${key}" with plan ${JSON.stringify(val)}`
          // );

          await callbackSyncProcess?.(
            realCounter,
            realTotalCount,
            key,
            val.decision
          );

          realCounter += 1;

          await dispatchOperationToActualV3(
            key,
            vaultRandomID,
            profileID,
            val,
            fsLocal,
            fsEncrypt,
            db,
            conflictAction
          );

          // console.debug(`finished ${key}`);
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

    profiler?.insert(`doActualSync: step ${i} end`);
    profiler?.removeIndent();
  }

  profiler?.insert(`doActualSync: exit`);
  profiler?.removeIndent();
};

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

/**
 * Every input variable should be mockable, so that testable.
 */
export async function syncer(
  fsLocal: FakeFs,
  fsRemote: FakeFs,
  fsEncrypt: FakeFsEncrypt,
  profiler: Profiler | undefined,
  db: InternalDBs,
  triggerSource: SyncTriggerSourceType,
  profileID: string,
  vaultRandomID: string,
  configDir: string,
  settings: RemotelySavePluginSettings,
  pluginVersion: string,
  configSaver: () => Promise<any>,
  getProtectModifyPercentageErrorStrFunc: any,
  markIsSyncingFunc: (isSyncing: boolean) => void,
  notifyFunc?: (s: SyncTriggerSourceType, step: number) => Promise<any>,
  errNotifyFunc?: (s: SyncTriggerSourceType, error: Error) => Promise<any>,
  ribboonFunc?: (s: SyncTriggerSourceType, step: number) => Promise<any>,
  statusBarFunc?: (
    s: SyncTriggerSourceType,
    step: number,
    everythingOk: boolean
  ) => any,
  callbackSyncProcess?: any
) {
  console.info(`startting sync.`);
  markIsSyncingFunc(true);

  let everythingOk = true;
  let step = 0;

  try {
    // check pro feature
    // if anything goes wrong, it will throw
    await checkProRunnableAndFixInplace(settings, pluginVersion, configSaver);

    // try mode?
    await notifyFunc?.(triggerSource, step);

    step = 1;
    await notifyFunc?.(triggerSource, step);
    await ribboonFunc?.(triggerSource, step);
    await statusBarFunc?.(triggerSource, step, everythingOk);
    profiler?.insert("start big sync func");

    step = 2;
    await notifyFunc?.(triggerSource, step);
    await ribboonFunc?.(triggerSource, step);
    await statusBarFunc?.(triggerSource, step, everythingOk);
    if (fsEncrypt.innerFs !== fsRemote) {
      throw Error(`your enc should has inner of the remote`);
    }
    const passwordCheckResult = await fsEncrypt.isPasswordOk();
    if (!passwordCheckResult.ok) {
      throw Error(passwordCheckResult.reason);
    }
    profiler?.insert(
      `finish step${step} (list partial remote and check password)`
    );

    step = 3;
    await notifyFunc?.(triggerSource, step);
    await ribboonFunc?.(triggerSource, step);
    await statusBarFunc?.(triggerSource, step, everythingOk);
    const remoteEntityList = await fsEncrypt.walk();
    // console.debug(`remoteEntityList:`);
    // console.debug(remoteEntityList);
    profiler?.insert(`finish step${step} (list remote)`);

    step = 4;
    await notifyFunc?.(triggerSource, step);
    await ribboonFunc?.(triggerSource, step);
    await statusBarFunc?.(triggerSource, step, everythingOk);
    const localEntityList = await fsLocal.walk();
    // console.debug(`localEntityList:`);
    // console.debug(localEntityList);
    profiler?.insert(`finish step${step} (list local)`);

    step = 5;
    await notifyFunc?.(triggerSource, step);
    await ribboonFunc?.(triggerSource, step);
    await statusBarFunc?.(triggerSource, step, everythingOk);
    const prevSyncEntityList = await getAllPrevSyncRecordsByVaultAndProfile(
      db,
      vaultRandomID,
      profileID
    );
    // console.debug(`prevSyncEntityList:`);
    // console.debug(prevSyncEntityList);
    profiler?.insert(`finish step${step} (prev sync)`);

    step = 6;
    await notifyFunc?.(triggerSource, step);
    await ribboonFunc?.(triggerSource, step);
    await statusBarFunc?.(triggerSource, step, everythingOk);
    let mixedEntityMappings = await ensembleMixedEnties(
      localEntityList,
      prevSyncEntityList,
      remoteEntityList,
      settings.syncConfigDir ?? false,
      configDir,
      settings.syncUnderscoreItems ?? false,
      settings.ignorePaths ?? [],
      fsEncrypt,
      settings.serviceType,
      profiler
    );
    profiler?.insert(`finish step${step} (build partial mixedEntity)`);

    mixedEntityMappings = await getSyncPlanInplace(
      mixedEntityMappings,
      settings.skipSizeLargerThan ?? -1,
      settings.conflictAction ?? "keep_newer",
      settings.syncDirection ?? "bidirectional",
      profiler,
      settings,
      triggerSource
    );
    console.debug(`mixedEntityMappings:`);
    console.debug(mixedEntityMappings); // for debugging
    profiler?.insert("finish building full sync plan");

    await insertSyncPlanRecordByVault(
      db,
      mixedEntityMappings,
      vaultRandomID,
      settings.serviceType
    );
    profiler?.insert("finish writing sync plan");
    profiler?.insert(`finish step${step} (make plan)`);

    // The operations above are almost read only and kind of safe.
    // The operations below begins to write or delete (!!!) something.

    step = 7;
    if (triggerSource !== "dry") {
      await notifyFunc?.(triggerSource, step);
      await ribboonFunc?.(triggerSource, step);
      await statusBarFunc?.(triggerSource, step, everythingOk);
      await doActualSync(
        mixedEntityMappings,
        fsLocal,
        fsEncrypt,
        vaultRandomID,
        profileID,
        settings.concurrency ?? 5,
        settings.protectModifyPercentage ?? 50,
        getProtectModifyPercentageErrorStrFunc,
        db,
        profiler,
        settings.conflictAction ?? "keep_newer",
        callbackSyncProcess
      );
      profiler?.insert(`finish step${step} (actual sync)`);
    } else {
      await notifyFunc?.(triggerSource, step);
      await ribboonFunc?.(triggerSource, step);
      await statusBarFunc?.(triggerSource, step, everythingOk);
      profiler?.insert(
        `finish step${step} (skip actual sync because of dry run)`
      );
    }
  } catch (error: any) {
    profiler?.insert("start error branch");
    everythingOk = false;
    await errNotifyFunc?.(triggerSource, error as Error);

    profiler?.insert("finish error branch");
  } finally {
  }

  profiler?.insert("finish syncRun");
  // console.debug(profiler?.toString());
  await profiler?.save(db, vaultRandomID, settings.serviceType);

  step = 8;
  await notifyFunc?.(triggerSource, step);
  await ribboonFunc?.(triggerSource, step);
  await statusBarFunc?.(triggerSource, step, everythingOk);

  console.info(`endding sync.`);
  markIsSyncingFunc(false);
}
