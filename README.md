# Remotely Save

This is yet another unofficial sync plugin for Obsidian.

## Disclaimer

- **This is NOT the [official sync service](https://obsidian.md/sync) provided by Obsidian.**

## !!!Caution!!!

As of Dec 2021, the plugin is considered in BETA stage. **DO NOT USE IT for any serious vaults.** **ALWAYS, ALWAYS, backup your vault before using this plugin.**

## Features

- Supports:
  - Amazon S3 or S3-compatible
  - Dropbox
  - Webdav
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

## Questions, Suggestions, Or Bugs

You are greatly welcome to ask questions, post any suggestions, or report any bugs! The project is mainly maintained on GitHub:

- Questions: [GitHub repo Discussions](https://github.com/fyears/remotely-save/discussions)
- Suggestions: also in [GitHub repo Discussions](https://github.com/fyears/remotely-save/discussions)
- Bugs: [GitHub repo Issues](https://github.com/fyears/remotely-save/issues) (NOT Discussion)

Additionally, the plugin author may occasionally visit Obsidian official forum and official Discord server, and pay attention to this-plugin-related information there.

## Download and Install

- Option #1: You can search, download, and install the plugin in official "community plugin list".
- Option #2: [![BuildCI](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml/badge.svg)](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml) Every artifacts are placed in the "Summary" under every successful builds.
- Option #3: Besides manually downloading the files, you can also use [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) to install this plugin.

## Usage

### S3

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
- After the authorization, the plugin can read your name and email (which cannot be unselected on Dropbox api), and read and write files in your Dropbox's `/Apps/remotely-save/${vaultName}` folder.
- If you decide to authorize this plugin to connect to Dropbox, please go to plugin's settings, and choose Dropbox then follow the instructions.
- Password-based end-to-end encryption is also supported. But please be aware that **the vault name itself is not encrypted**.

### webdav

- **webdav support is considered experimental.**
- Currently only supports BASIC authorization method.
- Currently webdav server has to be enabled CORS for requests from `app://obsidian.md` and `capacitor://localhost` and `http://localhost`, **AND** all webdav HTTP methods, **AND** all webdav headers. These are required, because Obsidian mobile works like a browser and mobile plugins are limited by CORS policies.
  - Popular software NextCloud and OwnCloud do **NOT** enable CORS by default. If you are using any of them, you should evaluate the risk, and find a way to enable CORS, before using this plugin.
  - The plugin is tested successfully under python package [`wsgidav` (version 4.0)](https://github.com/mar10/wsgidav). See [this issue](https://github.com/mar10/wsgidav/issues/239) for some details.
- Your data would be synced to a `${vaultName}` sub folder on your webdav server.
- Password-based end-to-end encryption is also supported. But please be aware that **the vault name itself is not encrypted**.

## Import And Export Plugin Settings By QR Code

It's often verbose / inconvenient to input credentials on mobile. (On different desktop computers, it's trivial to copy and paste `data.json` across different devices.)

So this plugin has a helper function to export settings as a QR code, then you could use mobile device's camera to import the settings.

Steps:

1. Configure the plugin settings on one device, and make sure the sync functions work. (E.g, you could sync notes using S3 credentials.)
2. Open plugin settings page. Then scroll down the page, until the section "Import and Export Settings". Click the button "Get QR Code". A new modal should show up and you should see a QR code.
3. On a second device, make sure the vault name is the same as the first device's.
4. On that second device, use its camera app, or any apps that support scanning QR codes, to scan the QR code from the first device. (On latest iOS, the system's built in camera app should work. On Android, at least one open source app [Binary Eye](https://github.com/markusfisch/BinaryEye) is tested to be working.)
5. A link / url / address should be identified in the scan-QR-code app, and you could follow the instruction in the app, and then you should be redirected to open the Obsidian app.
6. And finally, there should be a new notice in the Obsidian app saying the settings are successfully imported. Otherwise please check the error message in the notice.
