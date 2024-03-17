# Minimal Intrusive Design

~~Before version 0.3.0, the plugin did not upload additional meta data to the remote.~~

~~From version 0.3.0 ~ 0.3.40, the plugin just upload minimal extra necessary meta data to the remote.~~

From version 0.4.1 and above, the plugin doesn't need uploading meta data due to the sync algorithm upgrade.

## Benefits

Then the plugin doesn't make more-than-necessary assumptions about information on the remote endpoint.

For example, it's possbile for a uses to manually upload a file to s3, and next time the plugin can download that file to the local device.

And it's also possible to combine another "sync-to-s3" solution (like, another software) on desktops, and this plugin on mobile devices, together.

## ~~Necessarity Of Uploading Extra Metadata from 0.3.0 ~ 0.3.40~~

~~The main issue comes from deletions (and renamings which is actually interpreted as "deletion-then-creation").~~

~~If we don't upload any extra info to the remote, there's usually no way for the second device to know what files / folders have been deleted on the first device.~~

~~To overcome this issue, from and after version 0.3.0, the plugin uploads extra metadata files `_remotely-save-metadata-on-remote.{json,bin}` to users' configured cloud services. Those files contain some info about what has been deleted on the first device, so that the second device can read the list to apply the deletions to itself. Some other necessary meta info would also be written into the extra files.~~

## No uploading extra metadata from 0.4.1

Some information, including previous successful sync status of each file, is kept locally.
