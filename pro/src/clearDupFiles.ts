import type { FakeFsLocal } from "../../src/fsLocal";
import { getFileRenameForDup } from "./conflictLogic";

export const getDupFiles = async (fsLocal: FakeFsLocal) => {
  const allFilesAndFolders = await fsLocal.walk();

  allFilesAndFolders.sort((a, b) => -(a.keyRaw.length - b.keyRaw.length)); // descending

  const filenameSet: Set<string> = new Set();
  const filesToBeRemoved: Set<string> = new Set();

  for (const { keyRaw } of allFilesAndFolders) {
    if (keyRaw.endsWith("/")) {
      continue;
    }
    if (keyRaw.includes("dup")) {
      filenameSet.add(keyRaw);
    }

    const dup = getFileRenameForDup(keyRaw);
    if (filenameSet.has(dup)) {
      filesToBeRemoved.add(dup);
    }
  }

  return [...filesToBeRemoved];
};

export const clearDupFiles = async (
  filesToBeRemoved: string[],
  fsLocal: FakeFsLocal
) => {
  await Promise.all(filesToBeRemoved.map(async (f) => await fsLocal.rm(f)));
};
