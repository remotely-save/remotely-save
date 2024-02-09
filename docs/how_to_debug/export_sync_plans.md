English | [中文](/docs/how_to_debug/export_sync_plans.zh-cn.md)

# Export Sync Plans

## What's this?

Everytime the plugin starts a sync, it gathers all required information together, generates a "sync plan" of every operations to every files and folders, and assign the corresponding actual operations.

Thus, if something goes wrong, we should check the sync plan firstly.

## How To Export The Plans?

Please read through the following instructions.

### Disable Auto Sync Firstly

You should disable auto sync to avoid any unexpected running.

### Manual Sync If Not Yet

You should at least sync once, so that at least one sync plan is generated and saved. If you have synced the vualt before, there should be some sync plans already saved.

### Export To The File

Go to the plugin settings, scroll down to the section "Debug" -> "export sync plans", and click the button "Export". \*\*It would generate a new folder `_debug_remotely_save/` in your vault, and generate a file `sync_plans_hist_exported_on_{a_timestamp},md.` inside that folder.

## How To Read The Plans

Open the genrated `sync_plans_hist_exported_on_{a_timestamp},md.`. You should see a json, or multiple jsons. Every json represents a sync plan.

A sync plan looks like this:

```json
{
  "ts": 1646960867560,
  "remoteType": "onedrive",
  "mixedStates": {
    "abc.md": {
      "key": "abc.md",
      "existRemote": true,
      "mtimeRemote": 1646566632000,
      "sizeRemote": 56797,
      "remoteEncryptedKey": "abc.md",
      "changeMtimeUsingMapping": true,
      "existLocal": true,
      "mtimeLocal": 1646566632000,
      "sizeLocal": 56797,
      "decision": "skipUploading",
      "decisionBranch": 1
    },
    "New folder/": {
      "key": "New folder/",
      "deltimeRemote": 1646925354372,
      "existLocal": false,
      "existRemote": false,
      "decision": "keepRemoteDelHistFolder",
      "decisionBranch": 9
    }
  }
}
```

We usually care about the `mixedStates` property. As you may guess, every item in `mixedStates` represent a file or a folder.

We should find out the file/folder we are interested in (or we believe something goes wrong), then checkout the following properties:

```
decision
  What decision is made.

decisionBranch
  It's a mark of the actual logic in the sync code. Useful to debug.

existRemote
  Does the file/folder exist on the remote service?

mtimeRemote
  The "last modeified time" on the remote service.

deltimeRemote
  The "deletion time" on the remote record.

existLocal
  Does the file/folder exist locally?

mtimeLocal
  The max of "last modeified time" and "creation time" locally.

deltimeLocal
  The "deletion time" locally.
```

The `decision` SHOULD be determined by the modified times and deletion times, by the logic described in [the doc of sync alogorithm](../sync_algorithm_v2.md). In short, we collect four timestamps (`mtimeRemote`, `deltimeRemote`, `mtimeLocal`, `deltimeLocal`), and respect the max timestamp and its corresponding operation.

## Common Issues

Some users report that their "last modeified time"s or "creation time"s are not set correctly by the operating system. In this case, the plugin cannot do anything because it determines the sync plan by comparing the timestamps. It's suggested to check the settings of the operating system or check whether other programs are doing something to the files.
