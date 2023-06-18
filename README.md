# NoteSync

> It is fork of [Remotely Save](https://github.com/remotely-save/remotely-save) plugins. 
> 
> We are grateful to [@fyears](https://github.com/fyears) for a great plugin and want to make it even better.
>
> [!!!] Plugin have back compatability with old synced directory

This is unofficial sync plugin for Obsidian.

[![BuildCI](https://github.com/notesync-org/notesync/actions/workflows/auto-build.yml/badge.svg)](https://github.com/notesync-org/notesync/actions/workflows/auto-build.yml)
[![downloads of latest version](https://img.shields.io/github/downloads-pre/notesync-org/notesync/latest/main.js?sort=semver)](https://github.com/notesync-org/notesync/releases)

## Features

- Supported providers:
  - Amazon S3 or S3-compatible
  - Dropbox
  - OneDrive for personal
  - Webdav
  - [Here](./docs/services_connectable_or_not.md) shows more connectable (or not-connectable) services in details.
- **Obsidian Mobile supported.** Vaults can be synced across mobile and desktop devices with the cloud service as the "broker".
- **[End-to-end encryption](./docs/encryption.md) supported.
- **Scheduled auto sync supported.**
- **[Minimal Intrusive](./docs/minimal_intrusive_design.md).**
- **Fully open source under [Apache-2.0 License](./LICENSE).**
- **[Sync Algorithm open](./docs/sync_algorithm_v2.md) for discussion.**

## Limitations

- **To support deltions sync, extra metadata will also be uploaded.** See [Minimal Intrusive](./docs/minimal_intrusive_design.md).
- **No Conflict resolution. No content-diff-and-patch algorithm.** All files and folders are compared using their local and remote "last modified time" and those with later "last modified time" wins.
- **Cloud services cost you money.** Always be aware of the costs and pricing. Specifically, all the operations, including but not limited to downloading, uploading, listing all files, calling any api, storage sizes, may or may not cost you money.
- **Some limitations from the browser environment.** More technical details are [in the doc](./docs/browser_env.md).
- **You should protect your `data.json` file.** The file contains sensitive information.
  - It's strongly advised **NOT** to share your `data.json` file to anyone.
  - It's usually **NOT** a good idea to check the file into version control. By default, the plugin tries to create a `.gitignore` file inside the plugin directory if it doesn't exist, for ignoring `data.json` in the `git` version control. If you know exactly what it means and want to remove the setting, please modify the `.gitignore` file or set it to be empty.

## Questions, Suggestions and Bugs

You are greatly welcome to ask questions, post any suggestions, or report any bugs! The project is mainly maintained on GitHub:

- [Questions and Suggestions](https://github.com/notesync-org/notesync/discussions)
- [Bugs](https://github.com/notesync-org/notesync/issues)

Additionally, the plugin author may occasionally visit Obsidian official forum, and pay attention to this-plugin-related information there.

## Download and Install

- Option #1: Search in the official "community plugin list", or visit this: [https://obsidian.md/plugins?id=notesync](https://obsidian.md/plugins?id=notesync) (which should redirect you into Obsidian app), then install the plugin.
- Option #2: You can also use [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) to install this plugin. Input `notesync-org/notesync` in the configuration of BRAT.

## [Usage](./docs/usage.md)

## Scheduled Auto Sync

- You can configure auto syncing every N minutes in settings.
- In auto sync mode, if any error occurs, the plugin would **fail silently**.
- Auto sync only works when Obsidian is being opened. It's **technically impossible** to auto sync while Obsidian is in background, because the plugin just works in the browser environment provided by Obsidian.

## How To Deal With Hidden Files Or Folders

**By default, all files or folder starting with `.` (dot) or `_` (underscore) are treated as hidden files, and would NOT be synced.** It's useful if you have some files just staying locally. But this strategy also means that themes / other plugins / settings of this plugin would neither be synced.

In the latest version, you can change the settings to allow syncing `_` files or folders, as well as `.obsidian` special config folder (but not any other `.` files or folders).

## Bonus: Import And Export Not-Oauth2 Plugin Settings By QR Code

See [here](./docs/import_export_some_settings.md) for more details.

## Development
- [Localization](./docs/i18n.md)
- [Debugging](./docs/how_to_debug/README.md)
