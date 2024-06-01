export const MERGABLE_SIZE = 1000 * 1000; // 1 MB

export const COMMAND_CALLBACK_PRO = "remotely-save-cb-pro";
export const PRO_CLIENT_ID = process.env.DEFAULT_REMOTELYSAVE_CLIENT_ID;
export const PRO_WEBSITE = process.env.DEFAULT_REMOTELYSAVE_WEBSITE;

export type PRO_FEATURE_TYPE =
  | "feature-smart_conflict"
  | "feature-google_drive";

export interface FeatureInfo {
  featureName: PRO_FEATURE_TYPE;
  enableAtTimeMs: bigint;
  expireAtTimeMs: bigint;
}

export interface ProConfig {
  email?: string;
  refreshToken?: string;
  accessToken: string;
  accessTokenExpiresInMs: number;
  accessTokenExpiresAtTimeMs: number;
  enabledProFeatures: FeatureInfo[];
  credentialsShouldBeDeletedAtTimeMs?: number;
}

export interface GoogleDriveConfig {
  accessToken: string;
  accessTokenExpiresInMs: number;
  accessTokenExpiresAtTimeMs: number;
  refreshToken: string;
  remoteBaseDir?: string;
  credentialsShouldBeDeletedAtTimeMs?: number;
  scope: "https://www.googleapis.com/auth/drive.file";
}

export const DEFAULT_GOOGLEDRIVE_CLIENT_ID =
  process.env.DEFAULT_GOOGLEDRIVE_CLIENT_ID;
export const DEFAULT_GOOGLEDRIVE_CLIENT_SECRET =
  process.env.DEFAULT_GOOGLEDRIVE_CLIENT_SECRET;
