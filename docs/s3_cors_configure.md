# How To Configure S3 CORS Rules

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
