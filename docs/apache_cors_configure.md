# How To Configure Apache CORS Rules for Webdav

This method is [contributed by community](https://github.com/remotely-save/remotely-save/pull/31).

You should evaluate the risk by yourself before trying this method.

**You are strongly advised to backup your original Apache configuration files before making any changes.**

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
