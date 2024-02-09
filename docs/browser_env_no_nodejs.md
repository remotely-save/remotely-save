English | [中文](/docs/browser_env_no_nodejs.zh-cn.md)

# Limitations From The Browser Environment: No Node.js

To support the mobile Obsidian, the plugin is limited to be developed for the browser environment, instead of the Node.js environment.

Many js libraries are designed to work in both the browser and the Node.js environments. But some are not, because the browser doesn't provide the corresponding abilities.

For example, there is a popular npm package [`ssh2-sftp-client`](https://www.npmjs.com/package/ssh2-sftp-client) for SFTP. But it relies on the modules (e.g. `http`) from Node.js which cannot be "translated" to the browser environment. So it's impossible to make this plugin support SFTP. The same status applies to FTP / FTPS.

Likewise, [MEGA](https://mega.nz/) provides a SDK, but the SDK is [for C++ only](https://mega.nz/doc), so it's also impossible to make this plugin support MEGA.
