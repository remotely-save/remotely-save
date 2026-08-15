import { strict as assert } from "assert";
import {
  computeAccessTokenExpiresAtTime,
  decideCredentialAction,
  decideOnedriveCallbackAction,
} from "../src/oauthLogic";

describe("computeAccessTokenExpiresAtTime", () => {
  it("treats expires_in as seconds, not milliseconds", () => {
    const now = 1_000_000;
    // 3600 s lifetime minus the 5-minute safety margin
    assert.equal(
      computeAccessTokenExpiresAtTime(now, 3600),
      now + 3600 * 1000 - 5 * 60 * 1000
    );
  });

  it("never returns a time in the past for short-lived tokens", () => {
    const now = 1_000_000;
    // 60 s lifetime is shorter than the margin; must still be in the future
    const at = computeAccessTokenExpiresAtTime(now, 60);
    assert.ok(at > now, `expected ${at} > ${now}`);
  });
});

describe("decideOnedriveCallbackAction", () => {
  it("processes when a code arrives and a verifier is pending", () => {
    assert.deepEqual(
      decideOnedriveCallbackAction({ code: "abc" }, "some-verifier"),
      { kind: "process" }
    );
  });

  it("forwards instead of consuming the code when no auth is pending", () => {
    // an empty-string verifier means no auth in progress in this vault;
    // consuming the one-time code here would burn it (the multi-window bug)
    assert.deepEqual(decideOnedriveCallbackAction({ code: "abc" }, ""), {
      kind: "forward",
    });
    assert.deepEqual(decideOnedriveCallbackAction({ code: "abc" }, undefined), {
      kind: "forward",
    });
  });

  it("reports denial when the user rejected the consent screen", () => {
    assert.deepEqual(
      decideOnedriveCallbackAction(
        { error: "access_denied", error_description: "The user has denied" },
        "some-verifier"
      ),
      { kind: "denied", errorDescription: "The user has denied" }
    );
  });

  it("marks anything else as invalid", () => {
    assert.deepEqual(decideOnedriveCallbackAction({}, "v"), {
      kind: "invalid",
    });
  });
});

describe("decideCredentialAction", () => {
  it("keeps credentials when there is no refresh token", () => {
    assert.equal(
      decideCredentialAction({
        hasRefreshToken: false,
        deleteAtTimeMs: 0,
        nowMs: 100,
      }),
      "keep"
    );
  });

  it("keeps credentials before the deadline", () => {
    assert.equal(
      decideCredentialAction({
        hasRefreshToken: true,
        deleteAtTimeMs: 200,
        nowMs: 100,
      }),
      "keep"
    );
  });

  it("asks for a refresh attempt after the deadline - never a wipe", () => {
    assert.equal(
      decideCredentialAction({
        hasRefreshToken: true,
        deleteAtTimeMs: 100,
        nowMs: 200,
      }),
      "refresh-or-prompt"
    );
  });
});
