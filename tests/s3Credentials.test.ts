import { strict as assert } from "assert";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import type { AwsCredentialIdentityProvider } from "@aws-sdk/types";
import type { S3Config } from "../src/baseTypes";
import { getS3Credentials } from "../src/s3Credentials";

const staticConfig = {
  s3AccessKeyID: "existing-key",
  s3SecretAccessKey: "existing-secret",
} as S3Config;

describe("S3 AWS profile credentials", () => {
  it("preserves existing static credentials", () => {
    assert.deepEqual(getS3Credentials(staticConfig, true), {
      accessKeyId: "existing-key",
      secretAccessKey: "existing-secret",
    });
  });

  it("fails closed on mobile instead of falling back to saved keys", () => {
    assert.throws(
      () => getS3Credentials({ ...staticConfig, s3Profile: "work" }, false),
      /desktop/i
    );
  });

  it("passes the profile as an argument and retains the session token", async () => {
    let calls = 0;
    const config = { ...staticConfig, s3Profile: "work; echo unsafe" };
    const provider = getS3Credentials(config, true, async (profile) => {
      calls++;
      assert.equal(profile, "work; echo unsafe");
      return JSON.stringify({
        Version: 1,
        AccessKeyId: "temporary-key",
        SecretAccessKey: "temporary-secret",
        SessionToken: "session-token",
        Expiration: "2099-01-01T00:00:00Z",
      });
    });
    assert.ok(typeof provider === "function");
    const credentials = await provider();
    assert.equal(credentials.sessionToken, "session-token");
    assert.equal(
      credentials.expiration?.toISOString(),
      "2099-01-01T00:00:00.000Z"
    );
    await provider();
    assert.equal(calls, 1);
    assert.deepEqual(config, {
      ...staticConfig,
      s3Profile: "work; echo unsafe",
    });
  });

  it("refreshes credentials approaching expiry and coalesces concurrent calls", async () => {
    let calls = 0;
    const provider = getS3Credentials(
      { ...staticConfig, s3Profile: "work" },
      true,
      async () => {
        calls++;
        return JSON.stringify({
          AccessKeyId: `key-${calls}`,
          SecretAccessKey: "secret",
          SessionToken: "token",
          Expiration: new Date(
            Date.now() + (calls === 1 ? 60_000 : 3_600_000)
          ).toISOString(),
        });
      }
    ) as AwsCredentialIdentityProvider;
    assert.equal((await provider()).accessKeyId, "key-1");
    const results = await Promise.all([provider(), provider()]);
    assert.equal(calls, 2);
    assert.ok(results.every((x) => x.accessKeyId === "key-2"));
  });

  it("does not expose command output or fall back to static keys on failure", async () => {
    const provider = getS3Credentials(
      { ...staticConfig, s3Profile: "work" },
      true,
      async () => {
        throw new Error("sensitive-command-output");
      }
    ) as AwsCredentialIdentityProvider;
    await assert.rejects(provider(), (error: Error) => {
      assert.match(error.message, /AWS profile/);
      assert.ok(!error.message.includes("sensitive-command-output"));
      return true;
    });
  });

  it("uses execFile without a shell and finds AWS CLI outside the GUI PATH", async () => {
    const childProcess = require("node:child_process");
    const original = childProcess.execFile;
    const calls: string[] = [];
    childProcess.execFile = (
      executable: string,
      args: string[],
      options: any,
      callback: (error: { code: string } | null, stdout?: string) => void
    ) => {
      calls.push(executable);
      assert.equal(options.shell, undefined);
      assert.equal(options.env.AWS_CLI_AUTO_PROMPT, "off");
      assert.deepEqual(args, [
        "configure",
        "export-credentials",
        "--profile",
        "work; echo unsafe",
        "--format",
        "process",
      ]);
      if (executable === "aws") callback({ code: "ENOENT" });
      else callback(null, '{"AccessKeyId":"key","SecretAccessKey":"secret"}');
    };
    try {
      const provider = getS3Credentials(
        { ...staticConfig, s3Profile: "work; echo unsafe" },
        true
      ) as AwsCredentialIdentityProvider;
      assert.equal((await provider()).accessKeyId, "key");
      assert.deepEqual(calls, ["aws", "/usr/local/bin/aws"]);
    } finally {
      childProcess.execFile = original;
    }
  });

  it("signs an S3 request with profile credentials and the session token", async () => {
    const credentials = getS3Credentials(
      { ...staticConfig, s3Profile: "work" },
      true,
      async () =>
        JSON.stringify({
          AccessKeyId: "PROFILEKEY",
          SecretAccessKey: "profile-secret",
          SessionToken: "profile-session-token",
          Expiration: "2099-01-01T00:00:00Z",
        })
    );
    let checked = false;
    const client = new S3Client({
      region: "us-east-1",
      endpoint: "https://s3.us-east-1.amazonaws.com",
      credentials,
      requestHandler: {
        async handle(request: any) {
          assert.equal(
            request.headers["x-amz-security-token"],
            "profile-session-token"
          );
          assert.match(
            request.headers.authorization,
            /Credential=PROFILEKEY\//
          );
          assert.ok(!request.headers.authorization.includes("existing-key"));
          checked = true;
          return {
            response: {
              statusCode: 200,
              headers: {},
              body: Buffer.from(
                "<ListBucketResult><Name>test</Name></ListBucketResult>"
              ),
            },
          };
        },
      },
    });
    try {
      await client.send(
        new ListObjectsV2Command({ Bucket: "test", MaxKeys: 1 })
      );
      assert.ok(checked);
    } finally {
      client.destroy();
    }
  });

  for (const output of [
    "not json",
    "{}",
    '{"AccessKeyId":"key","SecretAccessKey":"secret","Expiration":"invalid"}',
    '{"AccessKeyId":"key","SecretAccessKey":"secret","Expiration":"2000-01-01"}',
  ]) {
    it(`rejects invalid or expired credential output: ${output}`, async () => {
      const provider = getS3Credentials(
        { ...staticConfig, s3Profile: "work" },
        true,
        async () => output
      ) as AwsCredentialIdentityProvider;
      await assert.rejects(provider(), /AWS profile/);
    });
  }
});
