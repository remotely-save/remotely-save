---
说明：GitHub Copilot 翻译
---
[English](/docs/remote_services/webdav_general/webav_cors.md) | 中文

如果您使用的是 Obsidian 桌面版 >= 0.13.25 或 iOS >= 1.1.1，则可以跳过 CORS 部分。

如果您使用的是 Obsidian 桌面版 < 0.13.25 或 iOS < 1.1.1 或任何 Android 版本：

- WebDAV 服务器必须为来自 `app://obsidian.md`、`capacitor://localhost` 和 `http://localhost` 的请求启用 CORS，并且必须启用所有 WebDAV HTTP 方法和所有 WebDAV 标头。这是必需的，因为 Obsidian 移动版的工作方式类似于浏览器，而移动插件受到 CORS 策略的限制，除非使用升级后的 Obsidian 版本。
- 流行的软件 NextCloud、OwnCloud 和 `rclone serve webdav` 默认情况下**不启用** CORS。如果您使用其中任何一个，请在使用此插件之前评估风险并找到一种启用 CORS 的方法，或者使用升级后的 Obsidian 版本。
  - **非官方**解决方法：NextCloud 用户可以**自行评估风险**，如果决定接受风险，可以安装 [WebAppPassword](https://apps.nextcloud.com/apps/webapppassword) 应用，并将 `app://obsidian.md`、`capacitor://localhost` 和 `http://localhost` 添加到 `Allowed origins`。
  - **非官方**解决方法：OwnCloud 用户可以**自行评估风险**，如果决定接受风险，可以下载上述 `WebAppPassword` 的 `.tar.gz` 文件，并在其实例上手动安装和配置。
- [Apache 也是可能的](./webdav_apache_cors.md)。
- 该插件已经成功测试通过了 python 包 [`wsgidav` (版本 4.0)](https://github.com/mar10/wsgidav)。有关详细信息，请参阅[此问题](https://github.com/mar10/wsgidav/issues/239)。
