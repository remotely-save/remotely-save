# 群晖 Webdav Server

[English](./README.md) | 中文

## 链接

<https://kb.synology.cn/zh-cn/DSM/tutorial/How_to_access_files_on_Synology_NAS_with_WebDAV>

## 注意

教程作者（Remotely Save 作者）**不是** NAS、群晖专家。请仔细阅读文档，并自行改动以适应您自身需求。

**没有设置防火墙和其他保护措施的话，将 NAS 暴露到公网上非常危险。**

## 步骤

本教程有用到群晖 DSM 7。

1. 创建共享文件夹。本教程示例创建了 `share2`。你需要允许某个账号对此的读写权限。

   ![](./synology_create_shared_folder.png)

2. 假设之后你想同步你的库到子文件夹，`哈哈哈/sub folder`，请先在共享文件夹 `share2` 底下创建好。

3. 从套件中心安装 webdav server 。
   ![](./synology_install_webdav_server.png)

4. 进入 webdav server 设置。

5. 如果你知道如何正确配置 https 证书的话，强烈建议开启 https。

   本教程简化示例，开启了 http。

   也设置“Enable DavDepthInfinity”，这可以加速插件连接速度。

   “Apply”。

   ![](./synology_webdav_server_settings.png)

6. 在 Remotely Save 设置页，你的地址应如下格式输入：

   `http(s)://<your synology ip or domain>:<port>/<shared folder>/<sub folders>`

   比如说，本教程里，正确的地址类似于：

   `http://<ip>:5000/share2/哈哈哈/sub folder`

   用户名和密码是你之前配置了允许读写 `share2` 的那个账号。

   Depth 设置应为“supports depth="infinity"”。

   检查连接！

   ![](./synology_remotely_save_settings.png)

7. 同步！
