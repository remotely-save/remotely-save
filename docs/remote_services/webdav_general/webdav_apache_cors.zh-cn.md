---
说明：GitHub Copilot 翻译
---
[English](/docs/remote_services/webdav_general/webdav_apache_cors.md) | 中文

# 如何配置Apache的Webdav CORS规则

该方法由社区贡献（https://github.com/remotely-save/remotely-save/pull/31）。

在尝试此方法之前，请自行评估风险。

**强烈建议在进行任何更改之前备份您的原始Apache配置文件。**

```apacheconf
<IfModule mod_headers.c>
  # Obsidian webdav
  SetEnvIf Origin "^app://obsidian.md$" IS_OBSIDIAN
  SetEnvIf Origin "^capacitor://localhost$" IS_OBSIDIAN
  SetEnvIf Origin "^http://localhost$" IS_OBSIDIAN
  Header always set Access-Control-Allow-Origin "*" env=IS_OBSIDIAN
  Header always set Access-Control-Allow-Methods "GET, HEAD, POST, PUT, OPTIONS, MOVE, DELETE, COPY, LOCK, UNLOCK, PROPFIND" env=IS_OBSIDIAN
  Header always set Access-Control-Allow-Headers "Authorization, Depth, DNT, User-Agent, Keep-Alive, Content-Type, accept, origin, X-Requested-With" env=IS_OBSIDIAN
  Header always set Access-Control-Expose-Headers "etag, dav" env=IS_OBSIDIAN

  # Allow OPTION request without authentication and respond with status 200
  RewriteCond %{ENV:IS_OBSIDIAN} 1
  RewriteCond %{REQUEST_METHOD} OPTIONS
  RewriteRule ^(.*)$ $1 [R=200,L]
</IfModule>
```
