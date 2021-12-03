# Remotely Save

This is yet another unofficial sync plugin for Obsidian.

## Disclaimer

- **This is NOT the [official sync service](https://github.com/fyears/obsidian-remotely-save.git) provided by Obsidian.**

## !!!Caution!!!

As of November 2021, the plugin is considered in BETA stage. **DO NOT USE IT for any serious vaults.** **Backup your vault before using this plugin.** Don't be surprise to data loss!

## Features

- **Amazon S3 or S3-compatible, and Dropbox services are supported.** Webdav supports on the half way.
- **Obsidiain Mobile supported.** Vaults can be synced across mobile and desktop devices with the cloud service as the "broker".
- **[End-to-end encryption](./docs/encryption.md) supported.** Files would be encrypted using openssl format before being sent to the cloud **if** user specify a password.
- **[Minimal Intrusive](./docs/minimal_intrusive_design.md).**
- **Fully open source under [Apache-2.0 License](./LICENSE).**
- **[Sync Algorithm open](./docs/sync_algorithm.md) for discussion.**

## Limitations

- **Users have to trigger the sync manually.** This design is intentional because the plugin is in beta, and it's better for users to be exactly aware of the running of this plugin.
- **"deletion" operation can only be triggered from local device.** It's because of the "[minimal intrusive design](./docs/minimal_intrusive_design.md)". May be changed in the future.
- **No Conflict resolution. No content-diff-and-patch algorithm.** All files and folders are compared using their local and remote "last modified time" and those with later "last modified time" wins.
- **Cloud services cost you money.** Always be aware of the costs and pricing.
- **All files or folder starting with `.` (dot) or `_` (underscore) are treated as hidden files, and would NOT be synced.** It's useful if you have some files just staying locally. But this strategy also means that themes / other plugins / settings of this plugin would neither be synced.

## Download and Install

- Option #1: [![BuildCI](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml/badge.svg)](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml) Every artifacts are placed in the "Summary" under every successful builds.
- Option #2: Besides manually downloading the files, you can also use [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) to install this plugin.
- Option #3: The pluin would be submitted to the official "community plugin list" in near future.

## Usage

### s3

- Prepare your S3 (-compatible) service information: [endpoint, region](https://docs.aws.amazon.com/general/latest/gr/s3.html), [access key id, secret access key](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html), bucket name. The bucket should be empty and solely for syncing a vault.
- Configure (enable) [CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html) for requests from `app://obsidian.md` and `capacitor://localhost` and `http://localhost`. It's unfortunately required, because the plugin sends requests from a browser-like envirement. And those addresses are tested and found on desktop and ios and android.
- Download and enable this plugin.
- Enter your infomation to the settings of this plugin.
- If you want to enable end-to-end encryption, also set a password in settings. If you do not specify a password, the files and folders are synced in plain, original content to the cloud.
- Click the new "switch" icon on the ribbon (the left sidebar), **every time** you want to sync your vault between local and remote. (No "auto sync" yet.)
- **Be patient while syncing.** Especially in the first-time sync.

### Dropbox

- **This plugin's function for Dropbox is not as mature as functions for S3.**
- **This plugin is NOT an official Dropbox product.** The plugin just uses Dropbox's public API.
- After the authorization, the plugin can read your name and email (which cannot be unselected on Dropbox api), and read and write files in your Dropbox's `/Apps/remotely-save` folder.
- If you decide to authorize this plugin to connect to Dropbox, please go to plugin's settings, and choose Dropbox then follow the instructions.
- Password-based end-to-end encryption is also supported.

### webdav

- **webdav support is buggy (as of now, 20211122) and considered experimental, so it's hidden by default.** Highly recommend to use the more stable s3.
- If you decide to give it a try, open settings, and click "Choose service" area five times, then a Notice should show up. Close and open settings again then you will be able to select webdav.
- Currently webdav server should enable CORS for requests, because of technical limitations of mobile.
