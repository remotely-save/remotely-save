## Material Source

To apply for the production use of Dropbox API, some descriptions are needed to be submitted to Dropbox. Coincidently, this can also be served as a "readme" to use this plugin with Dropbox.

## Some Backgrounds

1. Obsidian allows users to take notes using markdown files.
2. The "app", notesync. is an unofficial Obsidian plugin, helping users download and upload ("sync") their notes from and to Dropbox.
3. Technically, plugin is developed using web technologies.

## Api Usages

1. Plugin uses "App folder", to avoid unnecessary accessing users' other files.
2. Plugin uses "account_info.read", to get the displayed username, so that users know which of their accounts has been logged in after OAuth steps.
3. Plugin uses "files.content.read", so that it can read the "last modified time", and the content of files on Dropbox. Under some conditions, the plugin would download the files. For example, the plugin would compare the last modified timestamps of the file in the local device and that on Dropbox, and if the timestamp on Dropbox is larger, the plugin would download the "newer" file from Dropbox to local.
4. Plugin uses "files.content.write", so that it can upload or overwrite the content of files on Dropbox. Under some conditions, the plugin would do that. For example, the plugin would compare the last modified timestamps of the file in the local device and that on Dropbox, and if the timestamp in the local device is larger, the plugin would upload the "newer" file from local to Dropbox, and overwrite that file on Dropbox.

## Steps

Here are the steps to see the functionality of remotely-save.

Most steps have screenshots.

1. Download the note-taking app Obsidian (Windows or Mac versions are both ok) from its official website: https://obsidian.md/ . It's free to download and use. Then install it.
2. Open Obsidian, click the "Create" button under "Create new vault".
3. Pick a vault name, "example-vault", and choose a location, then click "Create".
   ![step03](./attachments/step03.png)
4. Close any update new if prompted.
5. Create a new note by clicking a button on the left. And write something on the note.
   ![step05](./attachments/step05.png)
6. Click "setting" (a gear icon) on the button left of the sidebar.
   ![step06](./attachments/step06.png)
7. In the settings panel, go to the "Community plugins" page, turn off the safe mode, and confirm to turn off the safe mode. Then click the "Browse" button for community plugins.
   ![step07](./attachments/step07.png)
8. Search "Remotely Save" and install on the result.
   ![step08](./attachments/step08.png)
9. After successful installing the plugin, go back to the "Community plugins" page, and enable the plugin.
   ![step09](./attachments/step09.png)
10. Go to newly added "Remotely Save" settings, select "Dropbox" in "Choose service", and click the "Auth" button.
    ![step10](./attachments/step10.png)
11. The standard auth flow address is shown, users should click the address, and finish the auth steps on the website. Finally, the Dropbox website should automatically redirect users back to the Obsidian app.
    ![step11](./attachments/step11.png)
12. The "Auth" button disappears. A new "Revoke Auth" appears.
    ![step12](./attachments/step12.png)
13. Go back to the main interface of Obsidian, a new "switch icon" should appear on the left sidebar. Click this, then the plugin would trigger the sync progress. It would compare meta info of local files and remote files (on Dropbox), and decide to download some files and/or upload some files.
    ![step13](./attachments/step13.png)
14. Create, edit, remove some notes, and repeat step 13, the files on Dropbox should also change to reflect the changes locally.
