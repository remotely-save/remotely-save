# AList

[English](./README.md) | 中文

## 链接

- 中文官网：<https://alist.nn.ci/zh/> 和 <https://alist.nn.ci/zh/guide/webdav.html>

## 步骤

1. 安装和使用 AList。获取账号名和密码。在网页上登录。
2. 新建挂载，检查挂载路径。如图所示是 `/alisttest davpath`。
   ![](./alist_mount_path.zh.png)
   ![](./alist_mount_path.en.png)
3. 从而构建 webdav 网址如下，**http(s)://域名** + **端口** + **`/dav`** + **挂载路径**，其中挂载路径中假如有空格，换成 `%20`：
   ```
   http[s]://domain:port/dav/[mountpath url encoded]
   http://127.0.0.1:5244/dav/alisttest%20davpath
   ```
4. 在 remotely-save 设置，输入**带域名端口`/dav`和挂载路径的网址**、账号、密码。
   ![](./alist_rs_settings.en.png)
5. 在 remotely-save 设置，检查连接。
6. 同步文件！
