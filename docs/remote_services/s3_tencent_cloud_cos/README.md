# Tencent Cloud COS

English | [中文](./README.zh-cn.md)

## Link

- international <https://console.tencentcloud.com/cos>

## 步骤 Steps

The example shows the steps of China version. International version should be similar.

1. Create a bucket with **private read-write permissions** and recommendly enable server-side-encryption.
2. In bucket list page, enter the bucket overview page of the bucket you just created. You should see the bucket name (your texts with the number of your account id), region, and access address.
   ![](./cos_bucket_info.png)
3. In CAM page, create api key, and note down the SecretID and SecretKey.
   ![](./cos_create_secret.png)
4. **Remove the bucket name from your access address to obtain your endpoint address! If your access address on the website is `https://<bucket-name-with-number>.cos.<region>.myqcloud.com`, then the endpoint address you are going to use is `https://cos.<region>.myqcloud.com`.**
5. In remotely-save settings page, enter your endpoint adress, SecretID, SecretKey,and bucket name.
   ![](./cos_setting.png)
6. Check Connectivity.
   ![](./cos_connection.png)
7. Sync!
