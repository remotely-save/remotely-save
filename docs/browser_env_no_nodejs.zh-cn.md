<!---
说明：GitHub Copilot 翻译
--->
[English](/docs/browser_env_no_nodejs.md) | 中文

# 浏览器环境的限制：无法使用 Node.js

为了支持移动端的 Obsidian，该插件只能在浏览器环境下开发，而不是在 Node.js 环境下。

许多 JavaScript 库旨在同时在浏览器和 Node.js 环境中工作。但是有些库不支持浏览器环境，因为浏览器无法提供相应的功能。

例如，有一个流行的 npm 包 [`ssh2-sftp-client`](https://www.npmjs.com/package/ssh2-sftp-client) 用于 SFTP。但它依赖于来自 Node.js 的模块（例如 `http`），这些模块无法在浏览器环境中使用。因此，无法使该插件支持 SFTP。FTP / FTPS 也处于同样的状态。

同样地，[MEGA](https://mega.nz/) 提供了一个 SDK，但该 SDK 仅适用于 C++，因此无法使该插件支持 MEGA。
