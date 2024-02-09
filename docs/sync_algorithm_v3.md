English | [中文](/docs/sync_algorithm_v3.zh-cn.md)

# Sync Algorithm V3

Drafted on 20240117.

An absolutely better sync algorithm. Better for tracking deletions and better for subbranching.

## Huge Thanks

Basically a combination of algorithm v2 + [synclone](https://github.com/Jwink3101/syncrclone) + [rsinc](https://github.com/ConorWilliams/rsinc) + (some of rclone [bisync](https://rclone.org/bisync/)). All of the later three are released under MIT License so no worries about the licenses.

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

We have _five_ input sources: local all files, remote all files, _local previous succeeded sync history_, local deletions, remote deletions.

Init run, consuming local deletions and remote deletions :

TBD

Later runs, use the first, second, third sources **only**.

TBD
