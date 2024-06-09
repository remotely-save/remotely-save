# pCloud (PRO)

# Links

<https://www.pcloud.com/>

# Intro

* It's a PRO feature of Remotely Save plugin.
* **This plugin is NOT an official pCloud product, and just uses pCloud's public api.**

# Steps

## Steps of Remotely Save subscription

1. Please sign up and sign in an online account, connect your plugin to your online account firstly. See [the PRO tutorial](../../pro/README.md) firstly.
2. Subscribe to "sync with pCloud" feature online.
3. Go back to your Remotely Save plugin inside Obsidian, click "Check again" button in PRO settings. So that the plugin knows some features are enabled. In this case, sync with pCloud should be detected.

## Steps of Connecting to your pCloud

After you enabled the PRO feature in your Remotely Save plugin, you can connect to your pCloud account now.

1. In Remotely Save settings, change your sync service to pCloud.
2. Click Auth, visit the link, go to pCloud website to start.
3. Follow the instruction on pCloud, and allow Remotely Save to connect.
4. You will be redirected back to Remotely Save plugin.
5. A notice will tell you that you've connected or not.
6. Sync! The plugin will create a vault folder in the root of your pCloud and upload notes into that folder.
7. **Read the caveats below.**

# The caveats

* As of June 2024, this feature is in beta stage. **Back up your vault before using this feature.**
* pCloud's API seems to not allow uploading empty files. You can choose to skip them or raise errors in Remotely Save plugin's settings.

# Why not use webdav?

1. pCloud only provides webdav for Premium. If you are a Premium user, you can still use pCloud webdav with Remotely Save.
2. The Remotely Save PRO feture "sync with pCloud" is developed using pCloud's native API, instead of webdav interface. It brings benefits such that the last modified time can be preserved.
