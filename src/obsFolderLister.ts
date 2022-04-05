import { Vault, Stat, ListedFiles } from "obsidian";
import { Queue } from "@fyears/tsqueue";
import chunk from "lodash/chunk";
import flatten from "lodash/flatten";

export interface ObsConfigDirFileType {
  key: string;
  ctime: number;
  mtime: number;
  size: number;
  type: "folder" | "file";
}

const isFolderToSkip = (x: string) => {
  let specialFolders = [".git", ".svn", "node_modules"];
  for (const iterator of specialFolders) {
    if (
      x === iterator ||
      x === `${iterator}/` ||
      x.endsWith(`/${iterator}`) ||
      x.endsWith(`/${iterator}/`)
    ) {
      return true;
    }
  }
  return false;
};

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

export const isInsideObsFolder = (x: string, configDir: string) => {
  if (!configDir.startsWith(".")) {
    throw Error(`configDir should starts with . but we get ${configDir}`);
  }
  return x === configDir || x.startsWith(`${configDir}/`);
};

export const listFilesInObsFolder = async (
  configDir: string,
  vault: Vault,
  pluginId: string
) => {
  const q = new Queue([configDir]);
  const CHUNK_SIZE = 10;
  const contents: ObsConfigDirFileType[] = [];
  while (q.length > 0) {
    const itemsToFetch = [];
    while (q.length > 0) {
      itemsToFetch.push(q.pop());
    }

    const itemsToFetchChunks = chunk(itemsToFetch, CHUNK_SIZE);
    for (const singleChunk of itemsToFetchChunks) {
      const r = singleChunk.map(async (x) => {
        const statRes = await vault.adapter.stat(x);
        const isFolder = statRes.type === "folder";
        let children: ListedFiles = undefined;
        if (isFolder) {
          children = await vault.adapter.list(x);
        }

        return {
          itself: {
            key: isFolder ? `${x}/` : x,
            ...statRes,
          } as ObsConfigDirFileType,
          children: children,
        };
      });
      const r2 = flatten(await Promise.all(r));

      for (const iter of r2) {
        contents.push(iter.itself);
        const isInsideSelfPlugin = isPluginDirItself(iter.itself.key, pluginId);
        if (iter.children !== undefined) {
          for (const iter2 of iter.children.folders) {
            if (isFolderToSkip(iter2)) {
              continue;
            }
            if (isInsideSelfPlugin && !isLikelyPluginSubFiles(iter2)) {
              // special treatment for remotely-save folder
              continue;
            }
            q.push(iter2);
          }
          for (const iter2 of iter.children.files) {
            if (isFolderToSkip(iter2)) {
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
  }
  return contents;
};
