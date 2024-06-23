# Onedrive (Full) (PRO)

# Intro

* It's a PRO feature of Remotely Save plugin.
* **This plugin is NOT an official Microsoft / Onedrive product, and just uses Onedrive's public api.**
* This still only applies to Onedrive for personal. The dev team doesn't have Onedrive for business account to develop and test on it.

# Steps

## Steps of Remotely Save subscription

1. Please sign up and sign in an online account, connect your plugin to your online account firstly. See [the PRO tutorial](../../pro/README.md) firstly.
2. Subscribe to "sync with Onedrive (Full)" feature online.
3. Go back to your Remotely Save plugin inside Obsidian, click "Check again" button in PRO settings. So that the plugin knows some features are enabled. In this case, sync with Onedrive (Full) should be detected.

## Steps of Connecting to your Onedrive

After you enabled the PRO feature in your Remotely Save plugin, you can connect to your Onedrive account now.

1. In Remotely Save settings, change your sync service to Onedrive (Full).
2. Click Auth, visit the link, go to Onedrive website to start.
3. Follow the instruction on Onedrive, and allow Remotely Save to connect.
4. You will be redirected back to Remotely Save plugin.
5. A notice will tell you that you've connected or not.
6. Sync! The plugin will create a vault folder **in the root** of your Onedrive and upload notes into that folder.
7. **Read the caveats below.**

# The caveats

* As of June 2024, this feature is in beta stage. 
    * **Back up your vault before using this feature.**
    * **Back up everything in your Onedrive (besides the sync sub folder) before using this feature!**
* Onedrive's API does not allow uploading empty files. You can choose to skip them or raise errors in Remotely Save plugin's settings.

# What's the difference of Onedrive (App Folder) and Onedrive (Full)?

Due to history reasons, Remotely Save only supported uploading to App Folder back to year 2021. Because that greatly ensured the security and ensure not messing up with others files.

However, repeatedly some users want to sync to arbitrary root folder rather than `/Apps/remotely-save/` folder. Thus as of June 2024, the new PRO feature is finally developed.

As of June 2024, connecting to Onedrive (App Folder) is free, but connecting to Onedrive (Full) is a PRO feature.
