/**
 * Every utils requiring Obsidian is placed here.
 */

import { Platform, requireApiVersion } from "obsidian";

export const API_VER_STAT_FOLDER = "0.13.27";
export const API_VER_REQURL = "0.13.26"; // desktop ver 0.13.26, iOS ver 1.1.1
export const API_VER_REQURL_ANDROID = "0.14.6"; // Android ver 1.2.1
export const API_VER_ENSURE_REQURL_OK = "1.0.0"; // always bypass CORS here

// 20241227: On Android, requestUrl causes OOM for large files (Base64 encoding).
// We disable it on Android to prevent crashes.
export const VALID_REQURL =
  (!Platform.isAndroidApp && requireApiVersion(API_VER_REQURL));
