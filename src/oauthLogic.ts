/**
 * Pure decision logic for the OAuth flows.
 * Deliberately free of "obsidian" imports so it can be unit tested.
 */

const ACCESS_TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000;

/**
 * expires_in from the token endpoint is in SECONDS.
 * Returns an absolute epoch-ms deadline, with a safety margin, that is
 * always in the future for a token that has any lifetime at all.
 */
export const computeAccessTokenExpiresAtTime = (
  nowMs: number,
  expiresInSeconds: number
): number => {
  const lifetimeMs = expiresInSeconds * 1000;
  return Math.max(
    nowMs + lifetimeMs - ACCESS_TOKEN_SAFETY_MARGIN_MS,
    nowMs + Math.floor(lifetimeMs / 2)
  );
};

export type OnedriveCallbackAction =
  | { kind: "process" }
  | { kind: "forward" }
  | { kind: "denied"; errorDescription: string }
  | { kind: "invalid" };

/**
 * Obsidian delivers obsidian:// callbacks to a single window. With several
 * vault windows open, the auth code can land in a vault that never started
 * an auth. That vault must NOT consume the one-time code ("forward" instead).
 */
export const decideOnedriveCallbackAction = (
  params: { code?: string; error?: string; error_description?: string },
  verifier: string | undefined
): OnedriveCallbackAction => {
  if (params.error !== undefined) {
    return {
      kind: "denied",
      errorDescription: params.error_description ?? params.error,
    };
  }
  if (params.code !== undefined) {
    if (verifier !== undefined && verifier !== "") {
      return { kind: "process" };
    }
    return { kind: "forward" };
  }
  return { kind: "invalid" };
};

export type CredentialAction = "keep" | "refresh-or-prompt";

/**
 * What to do with stored OAuth credentials at startup. Never returns a
 * "wipe": a possibly-still-valid refresh token must not be deleted on a
 * timer; try to use it, and only involve the user if the refresh fails.
 */
export const decideCredentialAction = (input: {
  hasRefreshToken: boolean;
  deleteAtTimeMs: number;
  nowMs: number;
}): CredentialAction => {
  if (!input.hasRefreshToken) {
    return "keep";
  }
  if (input.nowMs < input.deleteAtTimeMs) {
    return "keep";
  }
  return "refresh-or-prompt";
};
