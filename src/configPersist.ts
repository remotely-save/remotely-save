import { base64, base64url } from "rfc4648";
import { reverseString } from "./misc";

import type { RemotelySavePluginSettings } from "./baseTypes";

import * as origLog from "loglevel";
const log = origLog.getLogger("rs-default");

const DEFAULT_README: string =
  "Do NOT modify this manually. It's generated automatically.";

interface MessyConfigType {
  readme: string;
  d: string;
}

/**
 * this should accept the result after loadData();
 */
export const messyConfigToNormal = (
  x: MessyConfigType | RemotelySavePluginSettings
): RemotelySavePluginSettings => {
  log.debug("loading, original config on disk:");
  log.debug(x);
  if ("readme" in x && "d" in x) {
    // we should decode
    const y = JSON.parse(
      (
        base64url.parse(reverseString(x["d"]), {
          out: Buffer.allocUnsafe as any,
          loose: true,
        }) as Buffer
      ).toString("utf-8")
    );
    log.debug("loading, parsed config is:");
    log.debug(y);
    return y;
  } else {
    // return as is
    log.debug("loading, parsed config is the same");
    return x;
  }
};

/**
 * this should accept the result of original config
 */
export const normalConfigToMessy = (x: RemotelySavePluginSettings) => {
  const y = {
    readme: DEFAULT_README,
    d: reverseString(
      base64url.stringify(Buffer.from(JSON.stringify(x), "utf-8"), {
        pad: false,
      })
    ),
  };
  log.debug("encoding, encoded config is:");
  log.debug(y);
  return y;
};
