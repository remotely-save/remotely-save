# AWS S3 Bucket: How to configure user's policy

## Attention

Please read the doc carefully and adjust the optional fields accordingly. The doc is not fully tested and contributions are welcome.

## AWS Official Docs

- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-policy-language-overview.html>
- <https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-actions.html>
- <https://docs.aws.amazon.com/AmazonS3/latest/API/API_Operations.html>

## Prerequisites

Using the principle of least privilege is crucial for security when allowing a third party system to access your AWS resources.

**Prerequisites**: Ensure you have an AWS account and administrative access to manage IAM policies.

## Step 1: Create a new IAM Policy

1. Log in to your AWS Management Console.
1. Navigate to the IAM Policies section.
1. Create a new policy with the following configuration.

**Note**: `my-bucket` is a placeholder. For example, if your bucket's name is `obsidian-data`, the resource line should read `arn:aws:s3:::obsidian-data`.

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

> The policy allows the Obsidian plugin to list, add, retrieve, and delete objects in the specified S3 bucket.

## Step 2: Attach the Policy to Obsidian user

1. Create a new user in the IAM console. (Never use your own root user, as it would have full access to your AWS account).
1. When creating the user, select "Attach policy directly" and select the policy created.
1. Edit the recent created user and go to "Security Credentials" tab to create your access key.
1. Create an Access Key. If asked for a "use case", select "other"
1. Use the credentials in the plugin settings. (NEVER share these credentials)

> PS. The bucket doesn't need to have a policy, only the user.

## Verifying the Policy

After attaching the policy, test it by trying to access the S3 bucket through the Obsidian plugin. Ensure that all intended actions can be performed without errors.

## Troubleshooting

If you encounter permission errors, check the policy for typos in the bucket name or actions. Ensure the policy is attached to the correct user.
