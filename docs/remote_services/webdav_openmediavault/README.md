# Open Media Vault WebDAV

## Link 
https://www.openmediavault.org

## Steps

1. In Open Media Vault's UI, install the WebDAV plugin:
   * System → Plugins → openmediavault-webdav
2. Create a new Shared Folder
   * Storage → Shared Folders → Create
3. Enable WebDAV server
   * Services → WedDAV → Enable → Select previously created Shared Folder
4. Make sure Group is "webdav-users"
5. Add {your username} to "webdav-users" group
   * Users → Groups → webdav-users → Edit → Members
6. Set folder permissions
   * Storage → Shared Folders select the corresponding shared folder → Permissions → Set both {your username} and "webdav-users" group to "Read/Write" permissions
7. Back to Shared Folders, set specific Access Control List permissions
   * Select the shared folder → Access Control List → set {your username}, "webdav-users" and "www-data" to "Read/Write" permissions
8. Install Remotely Save in Obsidian, select WebDAV, add the URL http://[your-server-ip]/webdav, use your user credentials and connect.
