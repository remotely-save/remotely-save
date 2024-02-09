---
说明：GitHub Copilot 翻译
---
[English](/docs/remote_services/s3_general/s3_user_policy.md) | 中文

# AWS S3 Bucket: 如何配置用户策略

## 注意

请仔细阅读文档，并根据需要调整可选字段。该文档尚未完全测试，欢迎贡献。

## AWS 官方文档

- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-policy-language-overview.html>
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-actions.html>
- <https://docs.aws.amazon.com/AmazonS3/latest/API/API_Operations.html>

## 先决条件

在允许第三方系统访问您的 AWS 资源时，使用最小权限原则对于安全性至关重要。

**先决条件**：确保您拥有 AWS 帐户和管理 IAM 策略的管理员访问权限。

## 步骤 1：创建新的 IAM 策略

1. 登录 AWS 管理控制台。
1. 导航到 IAM 策略部分。
1. 使用以下配置创建新策略。

**注意**：`my-bucket` 是一个占位符。例如，如果您的存储桶名称是 `obsidian-data`，资源行应为 `arn:aws:s3:::obsidian-data`。

```JSON
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "ObsidianBucket",
            "Effect": "Allow",
            "Action": [
                "s3:HeadBucket"
            ],
            "Resource": "arn:aws:s3:::my-bucket"
        },
        {
            "Sid": "ObsidianObjects",
            "Effect": "Allow",
            "Action": [
                "s3:HeadObject",
                "s3:PutObject",
                "s3:CopyObject",
                "s3:UploadPart",
                "s3:UploadPartCopy",
                "s3:ListMultipartUploads",
                "s3:AbortMultipartUpload",
                "s3:CompleteMultipartUpload",
                "s3:ListObjects",
                "s3:ListObjectsV2",
                "s3:ListParts",
                "s3:GetObject",
                "s3:GetObjectAttributes",
                "s3:DeleteObject",
                "s3:DeleteObjects"
            ],
            "Resource": "arn:aws:s3:::my-bucket/*"
        }
    ]
}
```

> 该策略允许 Obsidian 插件在指定的 S3 存储桶中列出、添加、检索和删除对象。

## 步骤 2：将策略附加到 Obsidian 用户

1. 在 IAM 控制台中创建一个新用户。（永远不要使用您自己的根用户，因为它将完全访问您的 AWS 账户）。
1. 创建用户时，选择“直接附加策略”，并选择创建的策略。
1. 编辑最近创建的用户，转到“安全凭证”选项卡以创建您的访问密钥。
1. 创建访问密钥。如果要求提供“用途”，请选择“其他”。
1. 在插件设置中使用这些凭据。（永远不要共享这些凭据）

> PS. 存储桶不需要有策略，只需要用户有策略。

## 验证策略

在附加策略后，通过 Obsidian 插件尝试访问 S3 存储桶，确保所有预期的操作都可以无错误地执行。

## 故障排除

如果遇到权限错误，请检查存储桶名称或操作中的拼写错误。确保策略已附加到正确的用户。
