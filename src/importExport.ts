import QRCode from "qrcode";
import cloneDeep from "lodash/cloneDeep";

import {
  COMMAND_URI,
  UriParams,
  RemotelySavePluginSettings,
  QRExportType,
} from "./baseTypes";
import { getShrinkedSettings } from "./fsOnedrive";

export const exportQrCodeUri = async (
  settings: RemotelySavePluginSettings,
  currentVaultName: string,
  pluginVersion: string,
  exportFields: QRExportType
) => {
  let settings2: Partial<RemotelySavePluginSettings> = {};

  if (exportFields === "all_but_oauth2") {
    settings2 = cloneDeep(settings);
    delete settings2.dropbox;
    delete settings2.onedrive;
  } else if (exportFields === "dropbox") {
    settings2 = { dropbox: cloneDeep(settings.dropbox) };
  } else if (exportFields === "onedrive") {
    settings2 = { onedrive: getShrinkedSettings(settings.onedrive) };
  }

  delete settings2.vaultRandomID;
  const data = encodeURIComponent(JSON.stringify(settings2));
  const vault = encodeURIComponent(currentVaultName);
  const version = encodeURIComponent(pluginVersion);
  const rawUri = `obsidian://${COMMAND_URI}?func=settings&version=${version}&vault=${vault}&data=${data}`;
  // console.info(uri)
  const imgUri = await QRCode.toDataURL(rawUri);
  return {
    rawUri,
    imgUri,
  };
};

export interface ProcessQrCodeResultType {
  status: "error" | "ok";
  message: string;
  result?: RemotelySavePluginSettings;
}

/**
 * we also support directly parse the uri, instead of relying on web browser
 * @param input
 */
export const parseUriByHand = (input: string) => {
  if (!input.startsWith("obsidian://remotely-save?func=settings&")) {
    throw Error(`not valid string`);
  }

  const k = new URL(input);
  const output = Object.fromEntries(k.searchParams);
  return output;
};

export const importQrCodeUri = (
  inputParams: any,
  currentVaultName: string
): ProcessQrCodeResultType => {
  let params = inputParams as UriParams;
  if (
    params.func === undefined ||
    params.func !== "settings" ||
    params.vault === undefined ||
    params.data === undefined
  ) {
    return {
      status: "error",
      message: `the uri is not for exporting/importing settings: ${JSON.stringify(
        inputParams
      )}`,
    };
  }

  if (params.vault !== currentVaultName) {
    return {
      status: "error",
      message: `the target vault is ${
        params.vault
      } but you are currently in ${currentVaultName}: ${JSON.stringify(
        inputParams
      )}`,
    };
  }

  let settings = {} as RemotelySavePluginSettings;
  try {
    settings = JSON.parse(params.data);
  } catch (e) {
    return {
      status: "error",
      message: `errors while parsing settings: ${JSON.stringify(inputParams)}`,
    };
  }
  return {
    status: "ok",
    message: "ok",
    result: settings,
  };
};
