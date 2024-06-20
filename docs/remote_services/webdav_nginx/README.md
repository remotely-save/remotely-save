# Nginx Webdav 

The following tutorial uses Nginx with Docker in Linux, using the image [docker-nginx-webdav-nononsense](https://github.com/dgraziotin/docker-nginx-webdav-nononsense). It contains `ngx_http_dav_module` and `nginx-dav-ext-module`.

The description is adapted from the pull request [`dgraziotin/docker-nginx-webdav-nononsense#123`](https://github.com/dgraziotin/docker-nginx-webdav-nononsense/pull/123) by Remotely Save author.

Assuming you want a webdav server on Linux satisfying that:

1. Data is saved in your host machine's `./dav1` folder,
2. WebDAV is accessed by a user `user1` with password `password1`,
3. WebDAV is accessed on the host machine and port 8080: `127.0.0.1:8080`.
4. (Only Basic auth type is supported.)

Install docker nd set its permission properly. Then run this in terminal:

```bash
mkdir ./dav1 # create the local folder

docker container run --rm \
  -p 127.0.0.1:8080:80 \
  -v ./dav1:/data \
  -e WEBDAV_USERNAME=user1 \
  -e WEBDAV_PASSWORD=password1 \
  -e PUID=1000 \
  -e PGID=1000 \
  dgraziotin/nginx-webdav-nononsense
```

We do not have `--detach` prameter here, so the server will be closed as soon as you terminate the program or close terminal. You might want to adjust the settings further by yourself.

Then, in Remotely Save's setting, set these (auth type should always be `Basic`):

```
Server: http://127.0.0.1:8080
User: user1
Password: password1
Auth Type: Basic
Depth Header Sent To Servers: only supports depth='1'
```

![Nginx RS Setting](./nginx_rs_setting.png)

Then the server should be connected! You can sync now!

In you host machine's file system, you should find some files and folders were added into the folder `./dav1`.

# Notice

1. **Never expose your webdav server to public networks without protections or without strong passwords!**
2. I personally recommend using tailscale to build a LAN instead of expoing the service to public.
3. If you want to connect to the server from iOS (iPhone / iPad), the https is required. I personally recommend using caddy as the reverse proxy. Caddy can also be combined with tailscale. 
