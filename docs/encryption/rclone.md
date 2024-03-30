# RClone Crypt format

The encryption is compatible with RClone Crypt with **base64** name encryption format.

It's developed based on another js project by the same author of Remotely Save: [`@fyears/rclone-crypt`](https://github.com/fyears/rclone-crypt), which is NOT an official library from RClone, and is NOT affiliated with RClone.

Reasonable tests are also ported from official RClone code, to ensure the compatibility and correctness of the encryption.

## Warning

**ALWAYS BACKUP YOUR VAULT MANUALLY!!!**

If you switch between RClone Crypt format and OpenSSL enc format, you have to delete the cloud vault files **manually** and **fully**, so that the plugin can re-sync (i.e. re-upload) the newly encrypted versions to the cloud.

## Comparation between encryption formats

See the doc [Comparation](./comparation.md).

## Interoperability with official RClone

Please pay attention that the plugin uses **base64** of encrypted file names, while official RClone by default uses **base32** file names. The intention is purely for potentially support longer file names.

You could set up the RClone profile by calling `rclone config`. You need to create two profiles, one for your original connection and the other for RClone Crypt.

Finally, a working config file should like this:

```ini
[webdav1]
type = webdav
url = https://example.com/sharefolder1/subfolder1 # the same as the web address in Remotely Save settings.
vendor = other
user = <some webdav username>
pass = <some webdav password, obfuscated>

[webdav1crypt]
type = crypt
remote = nas1test:vaultname # the same as your "Remote Base Directory" (usually the vault name) in Remotely Save settings
password = <some encryption password, obfuscated>
filename_encoding = base64 # don't forget this!!!
```

You can use the `mount` command to view and see the files in file explorer! On Windows, the command should like this (the remote vault is mounted to drive `X:`):

```bash
rclone mount webdav1crypt: X: --network-mode
```
