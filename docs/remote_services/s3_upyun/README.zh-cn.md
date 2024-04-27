# 又拍云

## 链接

* 官网 <https://www.upyun.com/>
* 官网的 S3 文档 <https://help.upyun.com/knowledge-base/aws-s3%e5%85%bc%e5%ae%b9/>

## 注意！！！！！

又拍云似乎（？）文件都是默认公开的，强烈建议注意隐私问题，强烈建议设置插件加密。

## 步骤

1. 注册，新建对象存储。
2. 参考官网文档 <https://help.upyun.com/knowledge-base/aws-s3%e5%85%bc%e5%ae%b9/>，创建操作员然后创建 S3 访问凭证。
3. 在 Remotely Save 设置以下：
    * 服务地址（Endpoint）：`s3.api.upyun.com`  **一定是这个域名**
    * 区域（Region）：`us-east-1`
    * Acccess Key ID：您获取到的访问凭证的 AccessKey
    * Secret Access Key：您获取到的访问凭证的 SecretAccessKey
    * 存储桶（Bucket）的名字：您创建的“服务名”
    * 是否生成文件夹 Object：不生成（默认） **一定要选择不生成**
4. 可以在插件设置里，加上密码。
5. 同步。
