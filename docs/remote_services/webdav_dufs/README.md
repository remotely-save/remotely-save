# dufs webdav

## Link

<https://github.com/sigoden/dufs>

## Steps

1. Download the latest version: <https://github.com/sigoden/dufs/releases> and save it to a folder
2. Add the path environment variable.
3. Start the server in terminal, you can change the address (`127.0.0.1`) and username (`user1`) and password (`pass1`) accordingly:
    ```bash
    dufs -A --enable-cors --bind 127.0.0.1 --port 8080 --auth user1:pass1@/:rw
    ```
4. In remotely-save setting page, select webdav type, then input the address/account/**webdav password**(not your account password).
5. In remotely-save setting page, click "Check Connectivity".
6. Sync!
