# How To Configure S3 CORS Rules

If you are using the latest version of this plugin AND Obsidian >= 0.13.25, you do not need to configure it any more. If you are using Obsidian < 0.13.25, you are required to configure the rules as following.

Thanks to [@NAL100 in the Discussion](https://github.com/fyears/remotely-save/discussions/28).

Please try this config:

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
