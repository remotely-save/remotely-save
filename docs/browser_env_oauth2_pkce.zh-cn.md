---
说明：GitHub Copilot 翻译
---
[English](/docs/browser_env_oauth2_pkce.md) | 中文

# 来自浏览器环境的限制：OAuth2 PKCE

如果云服务使用OAuth流程，它需要支持PKCE，因为插件是发布给公众使用的，不能在客户端静态保存真实的密钥。

幸运的是，Dropbox和OneDrive都支持PKCE，这使得该插件可以轻松连接到它们。

Dropbox有一篇很好的[文章](https://dropbox.tech/developers/pkce--what-and-why-)解释了什么是PKCE以及如何使用它。
