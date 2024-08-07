import type { ListedFiles, Vault } from "obsidian";
import type { Entity } from "./baseTypes";

import { Queue } from "@fyears/tsqueue";
import chunk from "lodash/chunk";
import flatten from "lodash/flatten";
import { isSpecialFolderNameToSkip, statFix } from "./misc";

const isPluginDirItself = (x: string, pluginId: string) => {
  return (
    x === pluginId ||
    x === `${pluginId}/` ||
    x.endsWith(`/${pluginId}`) ||
    x.endsWith(`/${pluginId}/`)
  );
};

const isLikelyPluginSubFiles = (x: string) => {
  const reqFiles = [
    "data.json",
    "main.js",
    "manifest.json",
    ".gitignore",
    "styles.css",
  ];
  for (const iterator of reqFiles) {
    if (x === iterator || x.endsWith(`/${iterator}`)) {
      return true;
    }
  }
  return false;
};

export const listFilesInObsFolder = async (
  configDir: string,
  vault: Vault,
  pluginId: string,
  bookmarksOnly: boolean
): Promise<Entity[]> => {
  const q = new Queue([configDir]);
  const CHUNK_SIZE = 10;
  let contents: Entity[] = [];

  let iterRound = 0;

  while (q.length > 0) {
    const itemsToFetch: string[] = [];
    while (q.length > 0) {
      itemsToFetch.push(q.pop()!);
    }

    const itemsToFetchChunks = chunk(itemsToFetch, CHUNK_SIZE);
    for (const singleChunk of itemsToFetchChunks) {
      const r = singleChunk.map(async (x) => {
        const statRes = await statFix(vault, x);

        if (statRes === undefined || statRes === null) {
          throw Error("something goes wrong while listing hidden folder");
        }
        const isFolder = statRes.type === "folder";
        let children: ListedFiles | undefined = undefined;
        if (isFolder) {
          children = await vault.adapter.list(x);
        }

        if (
          !isFolder &&
          (statRes.mtime === undefined ||
            statRes.mtime === null ||
            statRes.mtime === 0)
        ) {
          throw Error(
            `File in Obsidian ${configDir} has last modified time 0: ${x}, don't know how to deal with it.`
          );
        }

        return {
          itself: {
            key: isFolder ? `${x}/` : x, // local always unencrypted
            keyRaw: isFolder ? `${x}/` : x,
            mtimeCli: statRes.mtime,
            mtimeSvr: statRes.mtime,
            size: statRes.size, // local always unencrypted
            sizeRaw: statRes.size,
          },
          children: children,
        };
      });
      const r2 = flatten(await Promise.all(r));

      for (const iter of r2) {
        contents.push(iter.itself);
        const isInsideSelfPlugin = isPluginDirItself(iter.itself.key, pluginId);
        if (iter.children !== undefined) {
          for (const iter2 of iter.children.folders) {
            if (
              isSpecialFolderNameToSkip(iter2, ["workspace", "workspace.json"])
            ) {
              continue;
            }
            if (isInsideSelfPlugin && !isLikelyPluginSubFiles(iter2)) {
              // special treatment for remotely-save folder
              continue;
            }
            q.push(iter2);
          }
          for (const iter2 of iter.children.files) {
            if (
              isSpecialFolderNameToSkip(iter2, ["workspace", "workspace.json"])
            ) {
              continue;
            }
            if (isInsideSelfPlugin && !isLikelyPluginSubFiles(iter2)) {
              // special treatment for remotely-save folder
              continue;
            }
            q.push(iter2);
          }
        }
      }
    }

    if (bookmarksOnly && iterRound > 1) {
      // list until bookmarks.json is found or next level is arrived.
      break;
    }

    iterRound += 1;
  }

  // console.debug(`contents in obs config: ${JSON.stringify(contents)}`);

  if (bookmarksOnly) {
    contents = contents.filter(
      (e) =>
        e.key === `${configDir}/` || e.key === `${configDir}/bookmarks.json`
    );
  }

  return contents;
};
