<!---
说明：GitHub Copilot 翻译
--->
[English](/docs/remote_services/s3_minio/README.md) | 中文

# MinIO

## 链接

<https://min.io/>

## 步骤

1. 配置您的MinIO实例并获取一个账户。
2. 创建一个访问密钥（在创建过程中，您还将获得自动生成的密钥）。
   ![](./minio_access_key.png)
3. 检查或设置区域。
   ![](./minio_region.png)
4. 创建一个存储桶。
   ![](./minio_create_bucket.png)
5. 在remotely-save设置页面中，输入地址/存储桶/访问密钥/密钥。通常，MinIO实例可能需要“S3 URL样式”=“路径样式”。启用“绕过CORS”，因为通常这是您想要的。
   ![](./minio_rs_settings.png)
6. 同步！
   ![](./minio_sync_success.png)

## 地址中的端口

在remotely-save设置中，只需输入完整的地址，包括`http(s)://`和`：端口`，例如`http://192.168.31.198:9000`。

已验证一切正常。

![](./minio_custom_port.png)
