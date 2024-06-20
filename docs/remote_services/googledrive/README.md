# Google Drive (GDrive) (PRO)

# Intro

* It's a PRO feature of Remotely Save plugin.
* **This plugin is NOT an official Google product, and just uses Google Drive's public api.**

# Steps

## Steps of Remotely Save subscription

1. Please sign up and sign in an online account, connect your plugin to your online account firstly. See [the PRO tutorial](../../pro/README.md) firstly.
2. Subscribe to "sync with Google Drive" feature online.
3. Go back to your Remotely Save plugin inside Obsidian, click "Check again" button in PRO settings. So that the plugin knows some features are enabled. In this case, sync with Google Drive should be detected.

## Steps of Connecting to your Google Drive

After you enabled the PRO feature in your Remotely Save plugin, you can connect to your Google Drive account now.

1. In Remotely Save settings, change your sync service to Google Drive.
    ![change remote to google drive](./change_remote_to_google_drive.png)
2. Click Auth, visit the link, go to Remotely Save website to start.
    ![visit start link](./google_drive_auth_link.png)
3. On the website, click the link to go to Google Drive auth page.
4. Follow the instruction on Google website, and allow (continue) Remotely Save to connect.
    ![allow Remotely Save in Google website](./google_drive_auth_allow.png)
5. You will be redirected to Remotely Save website, and you will get a code. Copy it...
    ![redirected back and get the code](./google_drive_auth_code_show.png)
6. ... And paste the code back to the plugin inside Obsidian. Click submit.
    ![submit the code in setting](./google_drive_code_submit.png)
7. A notice will tell you that you've connected or not.
8. Sync! The plugin will create a vault folder in the root of your Google Drive and upload notes into that folder.
9. **Read the caveats below.**

# Why so complicated?

Because Google Drive's api doesn't fit into the special envorinment of Obsidian plugin. So we need a website.

# The credential

The website does **NOT** store or save the Google drive credential (the code you obtian in the end of the flow). The website is just a "bridge" to help you obtain that code, and just manage your subscription to PRO features.

But please be aware that the code is saved locally in your Obsidian. It works like a special password. So that the plugin can upload or download or modify the files for you.

# The caveats

* As of June 2024, this feature is in beta stage. **Back up your vault before using this feature.**

* The plugin can **only** sees, reads or writes the files and folders created by itself! 

    It means that, you CANNOT manually create the vault folder in your Google Drive account. And if you manually upload any files using Google's official website, the plugin does **NOT** see them. All operations must go through Obsidian and uploaded by the plugin.

    You can, however, view, and download the files on Google Drive [official web page](https://drive.google.com/drive/u/0/my-drive).

    Precisely speaking, the plugin applies for the `drive.file` scope recommended by Google. See [the doc](https://developers.google.com/drive/api/guides/api-specific-auth#benefits) by Google for the scope's benefits. Basically the plugin will never (is unable to) mess up your other files or folders.

    Moreover, this scope is "not-sensitive", so that the plugin doesn't need to go through Google's complicated verification process while applying for it.

* Google Drive, unlike other cloud storage, allows files of same name co-existing in the same folder! (hmmmmm...) It may or may not make the plugin stop working. Users might need to remove the duplicated file manually on Google's official website.
