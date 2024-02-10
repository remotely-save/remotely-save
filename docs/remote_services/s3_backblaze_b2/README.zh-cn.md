<!---
说明：GitHub Copilot 翻译
--->
[English](/docs/remote_services/s3_backblaze_b2/README.md) | 中文

# Backblaze B2

## 链接

https://www.backblaze.com/cloud-storage

## 步骤

1. 在[此页面](https://www.backblaze.com/cloud-storage)上创建一个Backblaze账户。不需要提供信用卡信息。Backblaze B2提供10GB的免费存储空间。

2. 请注意，尽管B2提供一些免费配额，**如果存储使用量或API请求超过一定值，可能会产生费用！！！** 特别注意API请求！

3. 创建一个**存储桶**，您可以保留默认设置，或者可以启用加密（与Remotely Save中的设置不同）：

   ![](./s3_backblaze_b2-1-bucket.png)
   ![](./s3_backblaze_b2-2-create_bucket.png)

4. 复制`Endpoint`，例如`s3.us-east-005.backblazeb2.com` — 以后会用到。

5. 在🪣图标（"存储桶图标"）附近复制`bucketname` — 以后会用到。

   ![](./s3_backblaze_b2-3-copy.png)

6. 转到**应用程序密钥**：

   ![](./s3_backblaze_b2-4-app_keys.png)

7. **添加新密钥**：

   ![](./s3_backblaze_b2-5-add_new_app_keys.png)
   ![](./s3_backblaze_b2-6-app_keys_copy.png)

8. 保存`keyID`和`applicationKey` — 以后会用到。

9. 转到Obsidian中的Remotely Save设置，并：

   - 在**远程服务**中选择`S3或兼容`：
   - 从Backblaze复制`Endpoint`（参见第3步）到Remotely Save的`Endpoint`中
   - 从`endpoint`中获取`region`（例如`us-east-005`），并将其粘贴到Remotely Save的`endpoint`中
   - 从第7步中复制`keyID`到Remotely Save的`Access Key ID`中
   - 从第7步中复制`applicationKey`到Remotely Save的`Secret Access Key`中
   - 从第4步中复制`bucketname`到Remotely Save的`Bucket Name`中
     ![](./s3_backblaze_b2-7-copy_paste.png)

10. **启用Bypass CORS**：
    ![](./s3_backblaze_b2-8-cors.png)

11. 点击_Check Connectivity_中的**Check**，查看是否可以连接到B2存储桶：
    ![](./s3_backblaze_b2-9-check_connectionpng.png)

12. 同步！

    ![](./s3_backblaze_b2-10-sync.png)
