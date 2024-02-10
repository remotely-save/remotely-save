<!---
说明：GitHub Copilot 翻译
--->
[English](/docs/remote_services/s3_general/s3_cors_configure.md) | 中文

# 如何配置S3 CORS规则

如果您正在使用此插件的最新版本，并且Obsidian桌面版本 >= 0.13.25，移动版本 >= 1.1.1，则无需再进行配置。如果您正在使用Obsidian桌面版本 < 0.13.25，移动版本 < 1.1.1，则需要按照以下规则进行配置。

感谢[@NAL100在讨论中的贡献](https://github.com/fyears/remotely-save/discussions/28)。

请尝试以下配置：

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": [
      "app://obsidian.md",
      "capacitor://localhost",
      "http://localhost"
    ],
    "ExposeHeaders": [
      "Content-Length",
      "Content-Type",
      "Connection",
      "Date",
      "ETag",
      "Server",
      "x-amz-delete-marker",
      "x-amz-id-2",
      "x-amz-request-id",
      "x-amz-version-id"
    ]
  }
]
```
