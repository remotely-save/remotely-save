import { TFile, TFolder, type Vault } from "obsidian";
import type { Entity, MixedEntity } from "./baseTypes";
import { listFilesInObsFolder } from "./obsFolderLister";
import { Profiler } from "./profiler";

export const getLocalEntityList = async (
  vault: Vault,
  syncConfigDir: boolean,
  configDir: string,
  pluginID: string,
  profiler: Profiler
) => {
  profiler.addIndent();
  profiler.insert("enter getLocalEntityList");
  const local: Entity[] = [];

  const localTAbstractFiles = vault.getAllLoadedFiles();
  profiler.insert("finish getting getAllLoadedFiles");
  for (const entry of localTAbstractFiles) {
    let r = {} as Entity;
    let key = entry.path;

    if (entry.path === "/") {
      // ignore
      continue;
    } else if (entry instanceof TFile) {
      let mtimeLocal: number | undefined = entry.stat.mtime;
      if (mtimeLocal <= 0) {
        mtimeLocal = entry.stat.ctime;
      }
      if (mtimeLocal === 0) {
        mtimeLocal = undefined;
      }
      if (mtimeLocal === undefined) {
        throw Error(
          `Your file has last modified time 0: ${key}, don't know how to deal with it`
        );
      }
      r = {
        key: entry.path, // local always unencrypted
        keyRaw: entry.path,
        mtimeCli: mtimeLocal,
        mtimeSvr: mtimeLocal,
        size: entry.stat.size, // local always unencrypted
        sizeRaw: entry.stat.size,
      };
    } else if (entry instanceof TFolder) {
      key = `${entry.path}/`;
      r = {
        key: key,
        keyRaw: key,
        size: 0,
        sizeRaw: 0,
      };
    } else {
      throw Error(`unexpected ${entry}`);
    }

    local.push(r);
  }

  profiler.insert("finish transforming getAllLoadedFiles");

  if (syncConfigDir) {
    profiler.insert("into syncConfigDir");
    const syncFiles = await listFilesInObsFolder(configDir, vault, pluginID);
    for (const f of syncFiles) {
      local.push(f);
    }
    profiler.insert("finish syncConfigDir");
  }

  profiler.insert("finish getLocalEntityList");
  profiler.removeIndent();
  return local;
};
