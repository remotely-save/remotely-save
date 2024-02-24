# Sync Algorithm V3

Drafted on 20240117.

An absolutely better sync algorithm. Better for tracking deletions and better for subbranching.

## Huge Thanks

Basically a combination of algorithm v2 + [synclone](https://github.com/Jwink3101/syncrclone/blob/master/docs/algorithm.md) + [rsinc](https://github.com/ConorWilliams/rsinc) + (some of rclone [bisync](https://rclone.org/bisync/)). All of the later three are released under MIT License so no worries about the licenses.

## Features

Must have

1. true deletion detection
2. deletion protection (blocking) with a setting
3. transaction from the old algorithm
4. user warning show up, **new algorithm needs all clients to be updated!** (deliberately corrput the metadata file??)
5. filters
6. conflict warning
7. partial sync

Nice to have

1. true time and hash
2. conflict rename

## Description

We have _five_ input sources:

1. local all files
2. remote all files
3. _local previous succeeded sync history_
4. local deletions
5. remote deletions.

Init run, consuming remote deletions :

TBD

Later runs, use the first, second, third sources **only**.

Table modified based on synclone and rsinc. The number inside the table cell is the decision branch in the code.

| local\remote    | remote unchanged   | remote modified           | remote deleted     | remote created            |
| --------------- | ------------------ | ------------------------- | ------------------ | ------------------------- |
| local unchanged | (02/21) do nothing | (09) pull remote          | (07) delete local  | (??) conflict             |
| local modified  | (10) push local    | (16/17/18/19/20) conflict | (08) push local    | (??) conflict             |
| local deleted   | (04) delete remote | (05) pull                 | (01) clean history | (03) pull remote          |
| local created   | (??) conflict      | (??) conflict             | (06) push local    | (11/12/13/14/15) conflict |
