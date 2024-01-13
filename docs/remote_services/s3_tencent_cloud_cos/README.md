# 腾讯云 COS Tencent Cloud COS

## 链接 Link

- 中国区 <https://console.cloud.tencent.com/cos>
- international <https://console.tencentcloud.com/cos>

## 步骤 Steps

注意这里用中国区示例，国际区配置应该类似。The example shows the steps of China version. International version should be similar.

1. 在“存储桶列表”页，[“创建存储桶”](https://console.cloud.tencent.com/cos/bucket?action=create)。注意创建**私有读写**，建议打开服务端加密。Create a bucket with **private read-write permissions** and recommendly enable server-side-encryption.
2. 在桶列表页，点击刚刚存储的桶，进入概览页。可以见到桶名称（一般来说是之前指定的英文加账号数字），地域，访问域名。记录下来。In bucket list page, enter the bucket overview page of the bucket you just created. You should see the bucket name (your texts with the number of your account id), region, and access address.
   ![](./cos_bucket_info.png)
3. 在[“访问管理页”](https://console.cloud.tencent.com/cam/capi) ，“API 密钥管理”，“创建密钥”，要记录 SecretID 和 SecretKey。In CAM page, create api key, and note down the SecretID and SecretKey.
   ![](./cos_create_secret.png)
4. **把桶名称从访问域名移除，才是你即将输入的服务地址！假如你在腾讯云网站看到访问域名是 `https://<bucket-name-with-number>.cos.<region>.myqcloud.com`，那么“服务地址”是 `https://cos.<region>.myqcloud.com`. Remove the bucket name from your access address to obtain your endpoint address! If your access address on the website is `https://<bucket-name-with-number>.cos.<region>.myqcloud.com`, then the endpoint address you are going to use is `https://cos.<region>.myqcloud.com`.**
5. 在 remotely-save 设置，输入服务地址，SecretID，SecretKey，和 桶名称。In remotely-save settings page, enter your endpoint adress, SecretID, SecretKey,and bucket name.
   ![](./cos_setting.png)
6. 检查连接。Check Connectivity.
   ![](./cos_connection.png)
7. 可以同步了！Sync!
