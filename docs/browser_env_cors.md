# Limitations From The Browser Environment: CORS Issue

The plugin is developed for the browser environment. The "fake" browser behind the scenes also follows the CORS policy.

[MDN has a doc about CORS.](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

From Obsidian version >= insider 0.13.25, Obsidian [provides a new API `requiestUrl`](https://forum.obsidian.md/t/obsidian-release-v0-13-25-insider-build/32701), that allows the plugin to fully bypass the CORS issue. As of Mar 2022, the latest public-released Obsidian desktop has supported this API, but the Obsidian mobile still stays in insider.

For using this plugin in Obsidian version < 0.13.25, we need to configure the server side to return the header `Access-Control-Allow-Origin` allowing the origins `app://obsidian.md` and `capacitor://localhost` and `http://localhost`. Here is an example [configuration for Amazon S3](./s3_cors_configure.md).
