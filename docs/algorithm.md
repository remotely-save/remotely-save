# Algorithm

## Sources

We have three record sources:

1. Local files
2. Remote files
3. Local "delete-or-rename" history.

Assuming all sources are reliable.

## Deal with them

We list all combinations mutually exclusive and collectively exhaustive.

| ID  | Remote Files | Local files | Local delete rename history | Extra                             | Decision                                                                               |
| --- | ------------ | ----------- | --------------------------- | --------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | exist        | exist       | ignore                      | mtime_remote > mtime_local        | download remote file, create local folder if not exists, clear local history if exists |
| 2   | exist        | exist       | ignore                      | mtime_remote <= mtime_local       | upload local file, create remote folder if not exists, clear local history if exists   |
| 3   | exist        | not exist   | exist                       | mtime_remote >= delete_time_local | download remote file, create folder if not exists                                      |
| 4   | exist        | not exist   | exist                       | mtime_remote < delete_time_local  | delete remote file, clear local history                                                |
| 5   | exist        | not exist   | not exist                   |                                   | download remote file, create folder if not exists                                      |
| 6   | not exist    | exist       | ignore                      |                                   | upload local file, create remote folder if not exists, clear local history if exists   |
| 7   | not exist    | not exist   | ignore                      |                                   | clear local history if exists                                                          |
