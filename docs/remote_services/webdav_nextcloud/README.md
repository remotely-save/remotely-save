# Nextcloud

## Link

<https://nextcloud.com/>

## Steps

1. Install, or find a hosted version. 
    * The docker version <https://github.com/nextcloud/docker> for internal network, and [Caddy as reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy) (for https), are personally recommended.
    * If you find installing Nextcloud by yourselves is difficult, you can find some "Nextcloud's trusted, certified providers" on [Nextcloud Sign up page](https://nextcloud.com/sign-up/); For example, [The Good Cloud](https://thegood.cloud/) there generously provides 2 GB free stoarage space.
    * Remotely Save is tested to be working with the docker version and The Good Cloud.
2. Go to Nextcloud's settings. Find the webdav url (something like `https://cloud.example.com/remote.php/dav/files/USERNAME`). Use this (without tailing slash), and your account and your password, in Remotely Save.
