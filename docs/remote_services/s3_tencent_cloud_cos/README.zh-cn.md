# 腾讯云 COS

[English](./README.md) | 中文

## 链接

- 中国区 <https://console.cloud.tencent.com/cos>

## 步骤

注意这里用中国区示例，国际区配置应该类似。

1. 在“存储桶列表”页，[“创建存储桶”](https://console.cloud.tencent.com/cos/bucket?action=create)。注意创建**私有读写**，建议打开服务端加密。
2. 在桶列表页，点击刚刚存储的桶，进入概览页。可以见到桶名称（一般来说是之前指定的英文加账号数字），地域，访问域名。记录下来。
   ![](./cos_bucket_info.png)
3. 在[“访问管理页”](https://console.cloud.tencent.com/cam/capi) ，“API 密钥管理”，“创建密钥”，要记录 SecretID 和 SecretKey。
   ![](./cos_create_secret.png)
4. **把桶名称从访问域名移除，才是你即将输入的服务地址！假如你在腾讯云网站看到访问域名是 `https://<bucket-name-with-number>.cos.<region>.myqcloud.com`，那么“服务地址”是 `https://cos.<region>.myqcloud.com`.**
5. 在 remotely-save 设置，输入服务地址，SecretID，SecretKey，和 桶名称。
   ![](./cos_setting.png)
6. 检查连接。
   ![](./cos_connection.png)
7. 可以同步了！
