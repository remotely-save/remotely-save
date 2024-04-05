# OneDrive

- **This plugin is NOT an official Microsoft / OneDrive product.** The plugin just uses Microsoft's [OneDrive's public API](https://docs.microsoft.com/en-us/onedrive/developer/rest-api).
- After the authorization, the plugin can read your name and email, and read and write files in your OneDrive's `/Apps/remotely-save` folder.
- If you decide to authorize this plugin to connect to OneDrive, please go to plugin's settings, and choose OneDrive then follow the instructions.
- Password-based end-to-end encryption is also supported. But please be aware that **the vault name itself is not encrypted**.
- If you want to sync the files across multiple devices, **your vault name should be the same** while using default settings.

## FAQ

### How about OneDrive for Business?

This plugin only works for "OneDrive for personal", and not works for "OneDrive for Business" (yet). See [#11](https://github.com/fyears/remotely-save/issues/11) to further details.

### I cannot find `/Apps/remotely-save` folder

Mystically some users report that their OneDrive generate `/Application/Graph` instead of `/Apps/remotely-save`. See [#517](https://github.com/remotely-save/remotely-save/issues/517).

The solution is simple:

1. Backup your vault manually.
2. Go to onedrive website (<https://onedrive.live.com/>), and rename `/Application/Graph` to `/Application/remotely-save` (right click on the folder and you will see rename option)
3. Come back to Obsidian and try to sync!
