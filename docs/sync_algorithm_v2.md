# Sync Algorithm V2

## Sources

We have 4 record sources:

1. Local files. By scanning all files in the vault locally. Actually Obsidian provides an api directly returning this.
2. Remote files. By scanning all files on the remote service. Some services provide an api directly returning this, and some other services require the plugin scanning the folders recursively.
3. Local "delete-or-rename" history. It's recorded by using Obsidian's tracking api. So if users delete or rename files/folders outside Obsidian, we could do nothing.
4. Remote "delete" history. It's uploaded by the plugin in each sync.

Assuming all sources are reliable.

## Deal with them

We list all combinations mutually exclusive and collectively exhaustive.

### Files

| t1             | t2             | t3             | t4             | local file to do | remote file to do | local del history to do | remote del history to do | equal to sync v2 branch |
| -------------- | -------------- | -------------- | -------------- | ---------------- | ----------------- | ----------------------- | ------------------------ | ----------------------- |
| mtime_remote   | mtime_local    | deltime_remote | deltime_local  | del_if_exists    | del_if_exists     | clean                   | upload_local_del_history |                         |
| mtime_local    | mtime_remote   | deltime_remote | deltime_local  | del_if_exists    | del_if_exists     | clean                   | upload_local_del_history |                         |
| mtime_remote   | deltime_remote | mtime_local    | deltime_local  | del_if_exists    | del_if_exists     | clean                   | upload_local_del_history |                         |
| deltime_remote | mtime_remote   | mtime_local    | deltime_local  | del_if_exists    | del_if_exists     | clean                   | upload_local_del_history |                         |
| mtime_local    | deltime_remote | mtime_remote   | deltime_local  | del_if_exists    | del_if_exists     | clean                   | upload_local_del_history |                         |
| deltime_remote | mtime_local    | mtime_remote   | deltime_local  | del_if_exists    | del_if_exists     | clean                   | upload_local_del_history | 8                       |
| mtime_remote   | mtime_local    | deltime_local  | deltime_remote | del_if_exists    | del_if_exists     | clean                   | keep                     |                         |
| mtime_local    | mtime_remote   | deltime_local  | deltime_remote | del_if_exists    | del_if_exists     | clean                   | keep                     |                         |
| mtime_remote   | deltime_local  | mtime_local    | deltime_remote | del_if_exists    | del_if_exists     | clean                   | keep                     |                         |
| deltime_local  | mtime_remote   | mtime_local    | deltime_remote | del_if_exists    | del_if_exists     | clean                   | keep                     |                         |
| mtime_local    | deltime_local  | mtime_remote   | deltime_remote | del_if_exists    | del_if_exists     | clean                   | keep                     |                         |
| deltime_local  | mtime_local    | mtime_remote   | deltime_remote | del_if_exists    | del_if_exists     | clean                   | keep                     |                         |
| mtime_remote   | deltime_remote | deltime_local  | mtime_local    | skip             | upload_local      | clean                   | clean                    |                         |
| deltime_remote | mtime_remote   | deltime_local  | mtime_local    | skip             | upload_local      | clean                   | clean                    | 10                      |
| mtime_remote   | deltime_local  | deltime_remote | mtime_local    | skip             | upload_local      | clean                   | clean                    |                         |
| deltime_local  | mtime_remote   | deltime_remote | mtime_local    | skip             | upload_local      | clean                   | clean                    |                         |
| deltime_remote | deltime_local  | mtime_remote   | mtime_local    | skip             | upload_local      | clean                   | clean                    | 2;3;4;5;6               |
| deltime_local  | deltime_remote | mtime_remote   | mtime_local    | skip             | upload_local      | clean                   | clean                    |                         |
| mtime_local    | deltime_remote | deltime_local  | mtime_remote   | download_remote  | skip              | clean                   | clean                    |                         |
| deltime_remote | mtime_local    | deltime_local  | mtime_remote   | download_remote  | skip              | clean                   | clean                    | 7;9                     |
| mtime_local    | deltime_local  | deltime_remote | mtime_remote   | download_remote  | skip              | clean                   | clean                    |                         |
| deltime_local  | mtime_local    | deltime_remote | mtime_remote   | download_remote  | skip              | clean                   | clean                    |                         |
| deltime_remote | deltime_local  | mtime_local    | mtime_remote   | download_remote  | skip              | clean                   | clean                    | 1;9                     |
| deltime_local  | deltime_remote | mtime_local    | mtime_remote   | download_remote  | skip              | clean                   | clean                    |                         |

### Folders

We actually do not use any folders' metadata. Thus the only relevent info is their names, while the mtime is actually ignorable.

1. Firstly generate all the files' plan. If any files exist, then it's parent folders all should exist. If the should-exist folder doesn't exist locally, the local should create it recursively. If the should-exist folder doesn't exist remotely, the remote should create it recursively.
2. Then, a folder is deletable, if and only if all the following conditions meet:

   - it shows up in the remote deletion history
   - it's empty, or all its sub-folders are deletable

   Some examples:

   - A user deletes the folder in device 1, then syncs from the device 1, then creates the same-name folder in device 2, then syncs from the device 2. The folder is deleted (again), on device 2.
   - A user deletes the folder in device 1, then syncs from the device 1, then creates the same-name folder in device 2, **then create a new file inside it,** then syncs from the device 2. The folder is **kept** instead of deleted because of the new file, on device 2.
   - A user deletes the folder in device 1, then syncs from the device 1, then do not touch the same-name folder in device 2, then syncs from the device 2. The folder and its untouched sub-files should be deleted on device 2.
