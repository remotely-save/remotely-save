---
说明：GitHub Copilot 翻译
---
[English](/docs/remote_services/webdav_owncloud/README.md) | 中文

# ownCloud Webdav

## 链接

<https://owncloud.com/>

# 步骤

1. 创建一个账号。
2. 登录。
3. 在设置中启用“显示隐藏文件”并找到WebDAV地址。
   ![](./owncloud_address.png)
4. 在remotely-save设置中，输入WebDAV地址、账号、密码，以及**Depth Header Sent To Servers="only supports depth='1'"**。
   ![](./owncloud_rs_settings.png)
5. 在remotely-save设置页面，点击“检查连接性”。
6. 同步！
   ![](./owncloud_files.png)
