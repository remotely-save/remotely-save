---
说明：GitHub Copilot 翻译
---
[English](/docs/remote_services/s3_cloudflare_r2/README.md) | 中文

# Cloudflare R2

## 链接

<https://www.cloudflare.com/developer-platform/r2/>

## 步骤

1. **请注意可能会产生费用。**
2. 创建一个 Cloudflare 账户并启用 R2 功能。**Cloudflare 可能需要信用卡信息**，尽管 Cloudflare 提供慷慨的免费套餐和零出口费用。
3. 创建一个存储桶。
   ![](./s3_cloudflare_r2_create_bucket.png)
4. 创建一个具有“对象读取和写入”权限的访问密钥，并将其指定给您创建的存储桶。在创建过程中，您还将获得自动生成的密钥和终端地址。
   ![](./s3_cloudflare_r2_create_api_token.png)
5. 在 remotely-save 设置页面中，输入地址/存储桶/访问密钥/密钥。**将区域设置为 `us-east-1` 即可。**启用“绕过 CORS”，因为通常这是您想要的。

   点击“检查连接”。（如果遇到问题并确保信息正确，请升级 remotely-save 至 **版本 >= 0.3.29** 并重试。）

   ![](./s3_cloudflare_r2_rs_settings.png)

6. 同步！

## 与“检查连接”相关的问题

如果遇到问题并确保信息正确，请升级 remotely-save 至 **版本 >= 0.3.29** 并重试。

Cloudflare 不允许具有“对象读取和写入”权限的访问密钥执行 `HeadBucket` 操作。因此，检查连接可能不正常，但实际同步可能正常。插件的新版本 >= 0.3.29 通过使用 `ListObjects` 替代 `HeadBucket` 来解决此问题。
