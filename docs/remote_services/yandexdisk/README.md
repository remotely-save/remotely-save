# Yandex Disk (PRO)

# Links

<https://disk.yandex.com/client/disk>

# Intro

* It's a PRO feature of Remotely Save plugin.
* **This plugin is NOT an official Yandex Disk or Yandex product, and just uses Yandex Disk's public api.**

# Steps

## Steps of Remotely Save subscription

1. Please sign up and sign in an online account, connect your plugin to your online account firstly. See [the PRO tutorial](../../pro/README.md) firstly.
2. Subscribe to "sync with Yandex Disk" feature online.
3. Go back to your Remotely Save plugin inside Obsidian, click "Check again" button in PRO settings. So that the plugin knows some features are enabled. In this case, sync with Yandex Disk should be detected.

## Steps of Connecting to your Yandex Disk

After you enabled the PRO feature in your Remotely Save plugin, you can connect to your Yandex Disk account now.

1. In Remotely Save settings, change your sync service to Yandex Disk.
2. Click Auth, visit the link, go to Yandex Disk website to start.
3. Follow the instruction on Yandex Disk, and allow Remotely Save to connect.
4. You will be redirected back to Remotely Save plugin.
5. A notice will tell you that you've connected or not.
6. Sync! The plugin will create a vault folder in the root of your Yandex Disk and upload notes into that folder.
7. **Read the caveats below.**

# The caveats

* As of June 2024, this feature is in beta stage. **Back up your vault before using this feature.**

# Why not use webdav?

1. The Remotely Save PRO feture "sync with Yandex Disk" is developed using Yandex Disk's native API, instead of webdav interface. It brings benefits such that the last modified time can be preserved.
2. Some users prefer oauth2 method to authorize themselves.

# Bonus: where to register the app

* <https://oauth.yandex.com/client/new/> or <https://oauth.yandex.ru/client/new/>
* redirect uri can be set to <https://oauth.yandex.com/verification_code> or <https://oauth.yandex.ru/verification_code>.
