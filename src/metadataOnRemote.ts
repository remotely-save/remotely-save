import isEqual from "lodash/isEqual";
import { base64url } from "rfc4648";
import { reverseString } from "./misc";
import { log } from "./moreOnLog";

const DEFAULT_README_FOR_METADATAONREMOTE =
  "Do NOT edit or delete the file manually. This file is for the plugin remotely-save to store some necessary meta data on the remote services. Its content is slightly obfuscated.";

const DEFAULT_VERSION_FOR_METADATAONREMOTE = "20220220";

export const DEFAULT_FILE_NAME_FOR_METADATAONREMOTE =
  "_remotely-save-metadata-on-remote.json";

export const DEFAULT_FILE_NAME_FOR_METADATAONREMOTE2 =
  "_remotely-save-metadata-on-remote.bin";

export interface DeletionOnRemote {
  key: string;
  actionWhen: number;
}

export interface MetadataOnRemote {
  version?: string;
  generatedWhen?: number;
  deletions?: DeletionOnRemote[];
}

export const isEqualMetadataOnRemote = (
  a: MetadataOnRemote,
  b: MetadataOnRemote
) => {
  const m1 = a === undefined ? { deletions: [] } : a;
  const m2 = b === undefined ? { deletions: [] } : b;

  // we only need to compare deletions
  const d1 = m1.deletions === undefined ? [] : m1.deletions;
  const d2 = m2.deletions === undefined ? [] : m2.deletions;
  return isEqual(d1, d2);
};

export const serializeMetadataOnRemote = (x: MetadataOnRemote) => {
  const y = x;

  if (y["version"] === undefined) {
    y["version"] === DEFAULT_VERSION_FOR_METADATAONREMOTE;
  }
  if (y["generatedWhen"] === undefined) {
    y["generatedWhen"] = Date.now();
  }
  if (y["deletions"] === undefined) {
    y["deletions"] = [];
  }

  const z = {
    readme: DEFAULT_README_FOR_METADATAONREMOTE,
    d: reverseString(
      base64url.stringify(Buffer.from(JSON.stringify(x), "utf-8"), {
        pad: false,
      })
    ),
  };

  return JSON.stringify(z, null, 2);
};

export const deserializeMetadataOnRemote = (x: string | ArrayBuffer) => {
  let y1 = "";
  if (typeof x === "string") {
    y1 = x;
  } else {
    y1 = new TextDecoder().decode(x);
  }
  const y2: any = JSON.parse(y1);

  if (!("readme" in y2 && "d" in y2)) {
    throw Error("invalid remote meta data file!");
  }

  const y3 = JSON.parse(
    (
      base64url.parse(reverseString(y2["d"]), {
        out: Buffer.allocUnsafe as any,
        loose: true,
      }) as Buffer
    ).toString("utf-8")
  ) as MetadataOnRemote;
  return y3;
};
