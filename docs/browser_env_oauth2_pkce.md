# Limitations From The Browser Environment: OAuth2 PKCE

If the cloud service uses OAuth flow, it needs to support PKCE, because the plugin is released to the public, and no real secrets can be statically kept in the client.

Luckily, Dropbox and OneDrive supports PKCE, making it possible for this plugin to connect to them easily.

Dropbox has an excellent [article](https://dropbox.tech/developers/pkce--what-and-why-) explaining what is and how to use PKCE.
