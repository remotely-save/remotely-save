If you are using Obsidian desktop >= 0.13.25 or iOS >= 1.1.1, you can skip this CORS part.

If you are using Obsidian desktop < 0.13.25 or iOS < 1.1.1 or any Android version:

- The webdav server has to be enabled CORS for requests from `app://obsidian.md` and `capacitor://localhost` and `http://localhost`, **AND** all webdav HTTP methods, **AND** all webdav headers. These are required, because Obsidian mobile works like a browser and mobile plugins are limited by CORS policies unless under a upgraded Obsidian version.
- Popular software NextCloud, OwnCloud, `rclone serve webdav` do **NOT** enable CORS by default. If you are using any of them, you should evaluate the risk, and find a way to enable CORS, before using this plugin, or use a upgraded Obsidian version.
  - **Unofficial** workaround: NextCloud users can **evaluate the risk by themselves**, and if decide to accept the risk, they can install [WebAppPassword](https://apps.nextcloud.com/apps/webapppassword) app, and add `app://obsidian.md`, `capacitor://localhost`, `http://localhost` to `Allowed origins`
  - **Unofficial** workaround: OwnCloud users can **evaluate the risk by themselves**, and if decide to accept the risk, they can download `.tar.gz` of `WebAppPassword` above and manually install and configure it on their instances.
- [Apache is also possible](./webdav_apache_cors.md).
- The plugin is tested successfully under python package [`wsgidav` (version 4.0)](https://github.com/mar10/wsgidav). See [this issue](https://github.com/mar10/wsgidav/issues/239) for some details.
