# Usage

### S3

- Prepare your S3 (-compatible) service information: [endpoint, region](https://docs.aws.amazon.com/general/latest/gr/s3.html), [access key id, secret access key](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html), bucket name. The bucket should be empty and solely for syncing a vault.
- If you are using Obsidian desktop < 0.13.25 or mobile < 1.1.1, you need to configure (enable) [CORS](https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html) for requests from `app://obsidian.md` and `capacitor://localhost` and `http://localhost`, and add at least `ETag` into exposed headers. Full example is [here](./docs/s3_cors_configure.md). It's unfortunately required, because the plugin sends requests from a browser-like envirement. And those addresses are tested and found on desktop and ios and android.
- Download and enable this plugin.
- Enter your information to the settings of this plugin.
- If you want to enable end-to-end encryption, also set a password in settings. If you do not specify a password, the files and folders are synced in plain, original content to the cloud.
- Click the new "circle arrow" icon on the ribbon (the left sidebar), **every time** you want to sync your vault between local and remote. (Or, you could configure auto sync in the settings panel (See next chapter).) While syncing, the icon becomes "two half-circle arrows". Besides clicking the icon on the sidebar ribbon, you can also activate the corresponding command in the command palette.
- **Be patient while syncing.** Especially in the first-time sync.

### Dropbox

- The plugin just uses Dropbox's public API.
- After the authorization, the plugin can read your name and email (which cannot be unselected on Dropbox api), and read and write files in your Dropbox's `/Apps/notesync` folder.
- If you decide to authorize this plugin to connect to Dropbox, please go to plugin's settings, and choose Dropbox then follow the instructions. [More with screenshot is here](./docs/dropbox_review_material/README.md).
- Password-based end-to-end encryption is also supported. But please be aware that **the vault name itself is not encrypted**.

### OneDrive for personal

- The plugin just uses Microsoft's [OneDrive's public API](https://docs.microsoft.com/en-us/onedrive/developer/rest-api).
- This plugin only works for "OneDrive for personal", and not works for "OneDrive for Business" (yet). See [#11](https://github.com/notesync-org/notesync/issues/11) to further details.
- After the authorization, the plugin can read your name and email, and read and write files in your OneDrive's `/Apps/notesync` folder.
- If you decide to authorize this plugin to connect to OneDrive, please go to plugin's settings, and choose OneDrive then follow the instructions.
- Password-based end-to-end encryption is also supported. But please be aware that **the vault name itself is not encrypted**.

### webdav

- If you are using Obsidian desktop < 0.13.25 or iOS < 1.1.1 or any Android version:
    - The webdav server has to be enabled CORS for requests from `app://obsidian.md` and `capacitor://localhost` and `http://localhost`, **AND** all webdav HTTP methods, **AND** all webdav headers. These are required, because Obsidian mobile works like a browser and mobile plugins are limited by CORS policies unless under a upgraded Obsidian version.
    - Popular software NextCloud, OwnCloud, `rclone serve webdav` do **NOT** enable CORS by default. If you are using any of them, you should evaluate the risk, and find a way to enable CORS, before using this plugin, or use a upgraded Obsidian version.
        - **Unofficial** workaround: NextCloud users can **evaluate the risk by themselves**, and if decide to accept the risk, they can install [WebAppPassword](https://apps.nextcloud.com/apps/webapppassword) app, and add `app://obsidian.md`, `capacitor://localhost`, `http://localhost` to `Allowed origins`
        - **Unofficial** workaround: OwnCloud users can **evaluate the risk by themselves**, and if decide to accept the risk, they can download `.tar.gz` of `WebAppPassword` above and manually install and configure it on their instances.
    - The plugin is tested successfully under python package [`wsgidav` (version 4.0)](https://github.com/mar10/wsgidav). See [this issue](https://github.com/mar10/wsgidav/issues/239) for some details.
- Your data would be synced to a `${vaultName}` sub folder on your webdav server.
- Password-based end-to-end encryption is also supported. But please be aware that **the vault name itself is not encrypted**.
