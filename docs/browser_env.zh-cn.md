---
说明：GitHub Copilot 翻译
---
[English](/docs/browser_env.md) | 中文

# 来自浏览器环境的限制

Obsidian桌面版使用[Electron](https://www.electronjs.org/)开发，而Obsidian移动版使用[Capacitor](https://capacitorjs.com/)开发。

从技术上讲，插件（或任何插件？）在Obsidian提供的js环境中运行。为了支持移动版Obsidian，插件只能在浏览器环境下开发，而不是Node.js环境。

因此，有一些限制：

1. [CORS问题（在某些平台上的新Obsidian版本中已解决）。](./browser_env_cors.md)
2. [没有Node.js环境。](./browser_env_no_nodejs.md)
3. 如果云服务使用OAuth流程，需要支持PKCE。更多详情请参阅[此处](./browser_env_oauth2_pkce.md)。
4. [Obsidian关闭后无法后台运行。](./browser_env_no_background_after_closing.md)
