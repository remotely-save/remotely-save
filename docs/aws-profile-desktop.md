# AWS profiles on desktop

In the S3 settings, enter an **AWS profile (desktop only)** name from the
profiles in `~/.aws/config` or `~/.aws/credentials`. Leave it empty to
retain the original access-key authentication.

AWS CLI v2 must be installed. The plugin uses `aws` on PATH, with macOS
fallbacks at `/usr/local/bin/aws` and `/opt/homebrew/bin/aws`. It invokes
`aws configure export-credentials --profile NAME --format process` without a
shell. Profiles supported by that command include SSO, role assumption, and
`credential_process`.

For SSO, first run `aws sso login --profile NAME` in Terminal. The plugin does
not launch an interactive login. It reports an authentication error when the
session cannot be refreshed; log in again and retry.

The only new setting saved is the profile name. Returned credentials, including
the session token, are kept in memory and refreshed before expiration. Existing saved
access keys are ignored in profile mode, but are retained so switching back
does not lose the old configuration. Remove them in static-key mode if they
are no longer needed.

Profiles are local to each computer. A mobile device cannot use this mode.
Do not sync a profile-based configuration to mobile unless you intend sync
to fail there. Clear the profile field to return to access-key authentication
on that device.

## Read-only verification

The standard plugin **Check connectivity** also tests remote writes.
For a read-only verification use `aws s3api list-objects-v2 --profile NAME`
with the configured bucket/prefix and `--max-keys 1`, or send that command
through the plugin's credential provider. Do not print returned object names
or credential values into logs.
