# Minimal Intrusive Design

The plugin tries to avoid saving additional meta data remotely.

## Benefits

Then the plugin doesn't make any assumptions about information on the remote endpoint.

For example, it's possbile for a uses to manually upload a file to s3, and next time the plugin can download that file to the local device.

And it's also possible to combine another "sync-to-s3" solution (like, another software) on desktops, and this plugin on mobile devices, together.

## Flaws

The main issue comes from deletions (and renamings which is actually interpreted as "deletion-then-creation").

Consider this:

1. The user create and sync a file to the cloud on the 1st device.
2. Then download this file to the 2nd device.
3. And then delete this file on the 1st device.
4. And sync on the 1st device. The file on the cloud is also deleted.
5. And sync on the 2nd device. **The 2nd device would upload the file again to the cloud.**

In step 4, the file is marked "deleted" on the 1st device, and the 1st device send the command "delete this file on the cloud" to the cloud sevice (e.g. s3). Then the file on the cloud is also deleted. So far so good.

But, in step 5, because no meta data are saved on the cloud, the 2nd device doesn't know that the file are deleted. Instead, it thinks "the file was not synced to the cloud last time, so it's uploaded this time". So an unintentional upload occurs.

Currently no way to fix this if no meta data are saved remotely. The only workarounds are:

1. Delete the file on the 1st device, **before** syncing it to the cloud. Then the file never show up on the cloud or on the 2nd device.
2. Or, manually delete the file on 2nd device **before** step 5 in above situation.

## Future

This design may be changed in the feature, considering the flaws described above.
