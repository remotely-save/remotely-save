# Limitations From The Browser Environment: CORS Issue

The plugin is developed for the browser environment. The "fake" browser behind the scenes also follows CORS policy.

[MDN has a doc about CORS.](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

To solve the issue, we have some options:

1. The server side needs to return the header `Access-Control-Allow-Origin` allowing the origins `app://obsidian.md` and `capacitor://localhost` and `http://localhost`. Sometimes in the future, the header `Access-Control-Expose-Headers` with some values being set might be also needed.

   [Here is an example configuration for Amazon S3.](./s3_cors_configure.md)

   However, some cloud services do not allow configuring or exposing these headers. (Notably most public WebDAV services.)

   It's of course possible if the users build the services by themselves.

2. Obsidian implements and exposes a new api helping developers to bypass the CORS policy.

   Currently (as of Feb 2022), an api `request()` indeed exists, but it only deals with text-like data, and does not support binary data or response headers reading yet.

   Because this plugin allows uploading and downloading binary data, so a more feature-rich api is needed.
