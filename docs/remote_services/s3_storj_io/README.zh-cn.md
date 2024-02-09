---
说明：GitHub Copilot 翻译
---
[English](/docs/remote_services/s3_storj_io/README.md) | 中文

# Storj

## 链接

<https://www.storj.io/>

## 步骤

1. 注册一个账户。登录。
2. 创建一个存储桶。
3. 在访问管理中创建S3凭证。为存储桶授予所有权限。记住访问密钥、秘密密钥和终端节点。终端节点可能是 [`https://gateway.storjshare.io`](https://docs.storj.io/dcs/api/s3/s3-compatible-gateway)。
  ![](./storj_create_s3_cred_1.png)
  ![](./storj_create_s3_cred_2.png)
4. 将您的凭证输入到remotely-save设置中。区域应为 `global`（https://docs.storj.io/dcs/api/s3/s3-compatibility）。
  ![](storj_remotely_save_settings.png)
5. 检查连接性。
6. 同步！
