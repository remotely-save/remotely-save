import type { AwsCredentialIdentity } from "@aws-sdk/types";
import type { S3Config } from "./baseTypes";

async function exportAwsProfile(profile: string): Promise<string> {
  // Load Node modules only on desktop; never bundle a browser credential shim.
  const { execFile } =
    require("node:child_process") as typeof import("node:child_process");
  const { env } = require("node:process") as typeof import("node:process");
  const executables = ["aws", "/usr/local/bin/aws", "/opt/homebrew/bin/aws"];
  for (const executable of executables) {
    try {
      return await new Promise<string>((resolve, reject) => {
        execFile(
          executable,
          [
            "configure",
            "export-credentials",
            "--profile",
            profile,
            "--format",
            "process",
          ],
          {
            timeout: 30_000,
            maxBuffer: 1024 * 1024,
            env: { ...env, AWS_PAGER: "", AWS_CLI_AUTO_PROMPT: "off" },
          },
          (error, stdout) => {
            // execFile errors may contain stdout (including credentials).
            if (error) reject({ code: error.code });
            else resolve(stdout);
          }
        );
      });
    } catch (error: any) {
      if (error.code !== "ENOENT")
        throw new Error("AWS CLI credential export failed");
    }
  }
  throw new Error("AWS CLI not found");
}

export function getS3Credentials(
  config: S3Config,
  isDesktop: boolean,
  exportProfile: (profile: string) => Promise<string> = exportAwsProfile
): AwsCredentialIdentity | (() => Promise<AwsCredentialIdentity>) {
  const profile = config.s3Profile?.trim();
  if (!profile) {
    return {
      accessKeyId: config.s3AccessKeyID,
      secretAccessKey: config.s3SecretAccessKey,
    };
  }
  if (!isDesktop) {
    throw new Error("AWS profile authentication is available on desktop only.");
  }

  let cached: AwsCredentialIdentity | undefined;
  let refreshAfter = 0;
  let pending: Promise<AwsCredentialIdentity> | undefined;
  return async () => {
    if (cached && Date.now() < refreshAfter) return cached;
    if (pending) return pending;
    pending = (async () => {
      try {
        const value = JSON.parse(await exportProfile(profile));
        const expiration = value.Expiration
          ? new Date(value.Expiration)
          : undefined;
        if (
          typeof value.AccessKeyId !== "string" ||
          !value.AccessKeyId ||
          typeof value.SecretAccessKey !== "string" ||
          !value.SecretAccessKey ||
          (value.SessionToken !== undefined &&
            typeof value.SessionToken !== "string") ||
          (expiration && !(expiration.getTime() > Date.now()))
        ) {
          throw new Error("Invalid credentials");
        }
        cached = {
          accessKeyId: value.AccessKeyId,
          secretAccessKey: value.SecretAccessKey,
          sessionToken: value.SessionToken,
          expiration,
        };
        refreshAfter = expiration
          ? expiration.getTime() - 5 * 60_000
          : Date.now() + 5 * 60_000;
        return cached;
      } catch {
        throw new Error(
          `Cannot load AWS profile "${profile}". Check AWS CLI v2 and the profile; ` +
            "for SSO, run aws sso login --profile <profile> in Terminal, then retry."
        );
      }
    })();
    try {
      return await pending;
    } finally {
      pending = undefined;
    }
  };
}
