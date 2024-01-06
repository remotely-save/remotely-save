# AList

## 链接 Links

- English official website: <https://alist.nn.ci/> and <https://alist.nn.ci/guide/webdav.html>
- 中文官网：<https://alist.nn.ci/zh/> 和 <https://alist.nn.ci/zh/guide/webdav.html>

## 步骤 Steps

1. 安装和使用 AList。获取账号名和密码。在网页上登录。Install and run AList. Get the account and password. Login using the web page.
2. 新建挂载，检查挂载路径。如图所示是 `/alisttest davpath`。Add new storage. Pay attention to the mount path. The screenshot shows the mount path as `/alisttest davpath`.
   ![](./alist_mount_path.zh.png)
   ![](./alist_mount_path.en.png)
3. 从而构建 webdav 网址如下，**http(s)://域名** + **端口** + **`/dav`** + **挂载路径**，其中挂载路径中假如有空格，换成 `%20`：Construct the webdav address as: **http(s)://domain** + **port** + **`/dav`** + **mount path**, and the space inside the mount path should be replaced with `%20`:
   ```
   http[s]://domain:port/dav/[mountpath url encoded]
   http://127.0.0.1:5244/dav/alisttest%20davpath
   ```
4. 在 remotely-save 设置，输入**带域名端口`/dav`和挂载路径的网址**、账号、密码。In remotely-save setting page, select webdav type, then input the **full address with mount path**/account/password.
   ![](./alist_rs_settings.en.png)
5. 在 remotely-save 设置，检查连接。In remotely-save setting page, click "Check Connectivity".
6. 同步文件！Sync!
