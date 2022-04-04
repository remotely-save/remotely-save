import type {
  RemotelySavePluginSettings,
  WebdavConfig,
  WebdavDepthType,
} from "./baseTypes";

const RULES = {
  webdav: {
    depth: [
      {
        url: "^https://(.+).teracloud.jp/.+",
        depth: "auto_1",
        manualRecursive: true,
      },
      {
        url: "^https://dav.jianguoyun.com/dav/",
        depth: "auto_1",
        manualRecursive: true,
      },
    ],
  },
};

export const applyWebdavPresetRulesInplace = (
  webdav: Partial<WebdavConfig> | undefined
) => {
  if (webdav === undefined) {
    return {
      changed: false,
      webdav: webdav,
    };
  }
  for (const { url, depth, manualRecursive } of RULES.webdav.depth) {
    if (
      webdav.address !== undefined &&
      new RegExp(url).test(webdav.address) &&
      webdav.depth !== undefined &&
      webdav.depth.startsWith("auto_") &&
      webdav.depth !== depth
    ) {
      webdav.depth = depth as WebdavDepthType;
      webdav.manualRecursive = manualRecursive;
      return {
        changed: true,
        webdav: webdav,
      };
    }
  }
  return {
    changed: false,
    webdav: webdav,
  };
};

export const applyPresetRulesInplace = (
  settings: RemotelySavePluginSettings | undefined
) => {
  if (settings === undefined) {
    return {
      changed: false,
      settings: settings,
    };
  }
  const webdavRes = applyWebdavPresetRulesInplace(settings.webdav);
  return {
    changed: webdavRes.changed,
    settings: settings,
  };
};
