# Synology Webdav Server

English | [中文](./README.zh-cn.md)

## Link

<https://kb.synology.com/en-global/DSM/tutorial/How_to_access_files_on_Synology_NAS_with_WebDAV>

## Attention

The tutorial author (the author of Remotely Save) is NOT an expert of NAS / Synology. Please read the doc carefully and change it to accommodate your needs by yourself.

**It's dangerous to expose your NAS into public Internet if you don't know how to set up firewalls and other protections.**

## Steps

Synology DSM 7 is used in this tutorial.

1. Create a new shared folder if you don't have one. For this tutorial, a new shared folder `share2` is created. You should assing a proper user to read / write the shared folder.
   ![](./synology_create_shared_folder.png)

2. Assuming you want to sync your vault into sub folder `哈哈哈/sub folder`, please create the sub folder(s) correspondingly inide the shared folder `share2`.

3. Install webdav server from package center.
   ![](./synology_install_webdav_server.png)

4. Enter the webdav server settings.

5. If you know how to configure https certificates correctly, you are strongly recommend to enable https.

   For the demonstration purpose, this tutorial enable http server for the later steps.

   Also "Enable DavDepthInfinity", which could speed up the plugin runnings greatly.

   "Apply".

   ![](./synology_webdav_server_settings.png)

6. In Remotely Save settings, you should input your address as:

   `http(s)://<your synology ip or domain>/<shared folder>/<sub folders>`

   For example, in the tutorial, the proper url should be:

   `http://<ip>/share2/哈哈哈/sub folder`

   Username and password should be the user you configured before with read / write permissions to `share2`.

   Depth header should be "supports depth="infinity"".

   Check connectivity!

   ![](./synology_remotely_save_settings.png)

7. Sync!
