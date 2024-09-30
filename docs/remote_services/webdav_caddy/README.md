# Caddy with `http.handlers.webdav` module

> modified from the instruction from @cyruz-git in https://github.com/remotely-save/remotely-save/issues/825

## Link

<https://caddyserver.com/download?package=github.com%2Fmholt%2Fcaddy-webdav>

## Steps

1. Download caddy with webdav module from <https://caddyserver.com/download?package=github.com%2Fmholt%2Fcaddy-webdav>. Or you can install Caddy then install the plugins.
2. Create a folder for storing webdav server files. Like `/usr/local/mywebdav`.
3. Create a `Caddyfile` (yeah the file name itself is `Caddyfile`.) like this:
    ```caddy
    :8080 {
    	route /dav/* {
    		root /usr/local/mywebdav
    		basicauth {
    			# Username "Bob", password "hiccup"
    			Bob $2a$14$Zkx19XLiW6VYouLHR5NmfOFU0z2GTNmpkT/5qqR7hx4IjWJPDhjvG
    		}
    		uri strip_prefix /dav
    		webdav
    	}
    }
    ```
    The password hash is generated like [this](https://caddyserver.com/docs/caddyfile/directives/basic_auth).
4. In Remotely Save, setup:
    * address `http://localhost:8080/dav/`
    * username `Bob`
    * password `hiccup`
    * auth type: `basic`
5. Check the connection and sync!
