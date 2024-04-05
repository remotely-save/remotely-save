# Comparation Between Encryption Formats

## Warning

**ALWAYS BACKUP YOUR VAULT MANUALLY!!!**

If you switch between RClone Crypt format and OpenSSL enc format, you have to delete the cloud vault files **manually** and **fully**, so that the plugin can re-sync (i.e. re-upload) the newly encrypted versions to the cloud.

## The feature table

|                          | RClone Crypt                                                                               | OpenSSL enc                                                    | comments                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| key generation           | scrypt with fixed salt                                                                     | PBKDF2 with dynamic salt                                       | scrypt is better than PBKDF2 from the algorithm aspect. But RClone uses fixed salt by default. Also the parameters might affect the result.                         |
| content encryption       | XSalsa20Poly1305 on chunks                                                                 | AES-256-CBC                                                    | XSalsa20Poly1305 is way better than AES-256-CBC. And encryption by chunks should require less resources.                                                            |
| file name encryption     | EME on each segment of the path                                                            | AES-256-CBC on the whole path                                  | RClone has the benefit as well as pitfall that the path structure is preserved. Maybe it's more of a design decision difference? No comment on EME and AES-256-CBC. |
| viewing decrypted result | RClone has command that can mount the encrypted vault as if the encryption is transparent. | No convenient way except writing some scripts we are aware of. | RClone is way more convenient.                                                                                                                                      |

## Some notes

1. Anyway, security is a hard problem. The author of Remotely Save doesn't have sufficient knowledge to "judge" which one is the better format. **Use them at your own risk.**
2. Currently the RClone Crypt format is recommended by default in Remotely Save. Just because of the taste from the Remotely Save author, who likes RClone.
3. **Always use a long password.**
4. Both algorithms are selected deliberately to **be compatible with some well-known third-party tools** (instead of some home-made methods) and **have many tests to ensure the correctness**.
