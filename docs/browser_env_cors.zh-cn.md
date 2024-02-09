---
说明：GitHub Copilot 翻译
---
[English](/docs/browser_env_cors.md) | 中文

# 来自浏览器环境的限制：CORS 问题

该插件是为浏览器环境开发的。在幕后，"虚拟" 浏览器也遵循 CORS 策略。

[MDN 有关于 CORS 的文档。](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

1. 从 Obsidian 桌面版 >= 0.13.25 或移动版 >= 1.1.1 开始，Obsidian [提供了一个新的 API `requiestUrl`](https://forum.obsidian.md/t/obsidian-release-v0-13-25-insider-build/32701)，允许插件完全绕过 CORS 问题。截至 2022 年 3 月，最新发布的 Obsidian 桌面版已经支持该 API，但 Obsidian 移动版仍然处于内测阶段。

2. 如果要在 Obsidian 桌面版 < 0.13.25 或移动版 < 1.1.1 中使用该插件，我们需要配置服务器端返回头部 `Access-Control-Allow-Origin`，允许来源为 `app://obsidian.md`、`capacitor://localhost` 和 `http://localhost`。

   示例配置：

   - [Amazon S3](./s3_cors_configure.md)
   - [Apache](./apache_cors_configure.md)（[由社区贡献](https://github.com/remotely-save/remotely-save/pull/31)）
