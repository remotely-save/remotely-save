# Webdis

## Links

- Webdis: <https://github.com/nicolasff/webdis>
- Redis®: <https://redis.io/>

## Explanation and Background

I like the Redis® software very much, and would like to experiment using it as a "file storage". It seems to be nature by using path as the key and the content as the value (Sort of..., see below).

However, Redis® works by using TCP connections, and browser js cannot establish raw TCP connections. We need a HTTP gateway, to provide the HTTP api. Wedis seems to be the most famous open source one.

And of course, this method should work for Redis® alternatives: Valkey, Redict, KeyDB, Dragonfly, Garnet, ...

## Disclaimer

This app is NOT an official Redis® Ltd / Redis® OSS / Webdis product. Redis is a registered trademark of Redis Ltd.

**Never expose your Redis® or Webdis to public without security protection!!!** You are response for protecting your server.

## Usage

1. Install Redis®.
2. Install Webdis.
3. In `webdis.json`, configure the ACL for using password and username, and / or ip filters. **Never expose your Redis® or Webdis to public without security protection!!!**.
4. Install and configure reverse proxy, firewall, https, etc. (You have to configure HTTPS correctly if you want to use it on iOS)
5. In Remotely Save settings, enter your server address, username, password, and adjust the "base dir". Check connection.
6. Sync!
7. Serveral keys and values will be generated in your Redis® database:

   ```
   rs:fs:v1:${encodeURIComponent(vaultName+'/'+folderStructure+'/'+fileName)}:meta # you can HGETALL it
   rs:fs:v1:${encodeURIComponent(vaultName+'/'+folderStructure+'/'+fileName)}:content # you can GET it
   ```
