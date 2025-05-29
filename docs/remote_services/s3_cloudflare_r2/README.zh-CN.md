# Cloudflare R2 配置指南


- [Cloudflare R2 配置指南](#cloudflare-r2-配置指南)
  - [适用场景](#适用场景)
  - [Cloudflare R2免费计划](#cloudflare-r2免费计划)
  - [前置准备](#前置准备)
    - [1. 注册 Cloudflare 账户](#1-注册-cloudflare-账户)
    - [2. 注册/完善 PayPal 账户](#2-注册完善-paypal-账户)
      - [关联银行账户和卡](#关联银行账户和卡)
  - [配置 Cloudflare R2](#配置-cloudflare-r2)
    - [1. 创建存储桶（Bucket）](#1-创建存储桶bucket)
    - [2. 生成 API 访问密钥](#2-生成-api-访问密钥)
  - [配置 Obsidian 插件](#配置-obsidian-插件)
    - [1. 安装 Remotely Save 插件](#1-安装-remotely-save-插件)
    - [2. 配置 R2 连接](#2-配置-r2-连接)
  - [附加信息](#附加信息)
    - [A类操作](#a类操作)
    - [B 类操作](#b-类操作)
    - [两种令牌的区别](#两种令牌的区别)


## 适用场景

- 需要快速稳定同步笔记
- 具备以下条件：
   - 拥有有效信用卡或借记卡。
   - 拥有科学上网的能力。

---

## [Cloudflare R2免费计划](https://developers.cloudflare.com/r2/pricing/)

> 如有变动，请以官网资讯为准

| 项目               | 标准存储         | 不频繁访问存储（Beta版） |
|--------------------|------------------|--------------------------|
| 存储费用           | $0.015 / GB-月   | $0.01 / GB-月            |
| A类操作费用        | $4.50 / 百万次请求 | $9.00 / 百万次请求       |
| B类操作费用        | $0.36 / 百万次请求 | $0.90 / 百万次请求       |
| 数据检索费用       | 无               | $0.01 / GB               |
| 出站流量费用       | 免费             | 免费                     |

**免费额度（仅限标准存储）**：

- 存储：10 GB-月 / 月
- A类操作：100 万次请求 / 月
- B类操作：1,000 万次请求 / 月

**存储费用计算方式**：

存储费用以 **千兆字节-月（GB-月）** 为计费单位。

GB-月的计算方式为：按计费周期（30天）内每天的**峰值存储量**取平均值。

---

## 前置准备

### 1. 注册 Cloudflare 账户
- 访问 [Cloudflare 官网](https://dash.cloudflare.com/sign-up) 注册账号。

### 2. 注册/完善 PayPal 账户

> Cloudflare 不支持借记卡，即使售价 $0 的产品也需要绑定个人付款信息
> 
> 所以对于只有借记卡的用户，可以使用 Paypal 来验证
> 
> 以下操作建议使用网页端 Paypal

- 访问 [PayPal 官网](https://www.paypal.com/welcome/signup) 注册账户。

#### 关联银行账户和卡

- 关联银行账户：
	- ![关联银行账户](./s3_cloudflare_r2_01.png)
	- 银行名称填英文，可以试着打出关键词，会自动弹出匹配项
	- SWIFT代码通过搜索引擎获得 
		- 附[中国银行国内机构SWIFT代码](https://www.bankofchina.com/aboutboc/ab6/200810/t20081016_7363.html)
	- 分行地址可不填，地址太长会不予通过
	- 账号填写你本人在该银行持有的卡号
		>如果你的卡是在分行开通，填写分行的名称和SWIFT代码不给通过的话，不妨尝试填入总行的名称与代码
	
- 关联卡
	- 如果有信用卡按照页面要求输入信息即可。
	- ![关联信用卡](./s3_cloudflare_r2_02.png)
	- 大部分借记卡不存在CVV代码，直接输入借记卡卡号，那两个框就会消失。（在Paypal App操作大概率会失败，请尝试网页端）
	- ![关联借记卡](./s3_cloudflare_r2_03.png)
	- 最后短信验证即可完成。

> 其他信息后续可自行完善，没有难度

---

## 配置 Cloudflare R2

### 1. 创建存储桶（Bucket）
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。

2. 在左边的菜单栏导航到 **R2 对象存储** → **点击订阅** → **完善付款信息(信用卡/Paypal)**

3. 返回主菜单，继续点击`R2 对象存储` → `创建存储桶`

4. 输入自定义名称（如 `obsidian-sync`、`obsidian-sync-bucket`等），选择存储位置。

	- ![创建存储桶](./s3_cloudflare_r2_04.png)

### 2. 生成 API 访问密钥

1. 返回主菜单，进入 **R2 对象存储** → **管理 API 令牌**。
	- ![生成 API 访问密钥](./s3_cloudflare_r2_05.png)

2. 选择 **创建User API 令牌**。
	- ![创建User API 令牌](./s3_cloudflare_r2_06.png)

3. 配置权限：
   - 授予 **对象读和写** 权限。
   - 作用域推荐限制于指定存储桶。
   - ![配置权限](./s3_cloudflare_r2_07.png)

4. 点击 **创建令牌** （仅显示一次，先不要关闭该网页）
	- 记录三个值：**Access Key ID**、 **Secret Key**、**管辖权地终结点**
	- ![创建令牌](./s3_cloudflare_r2_08.png)

---

## 配置 Obsidian 插件

### 1. 安装 Remotely Save 插件

安装部分请查看项目主文档说明

### 2. 配置 R2 连接

1. 进入插件设置页，选择`S3或兼容S3的服务`

2. 填写以下字段：
   - `服务地址(Endpoint)`填入Cloudflare提供的`管辖权地终结点`；
   - `区域(Region)`填入`us-east-1`
   - `Access Key ID`填入Cloudflare提供的`访问密钥ID`；
   - `Secret Access Key`填入Cloudflare提供的`机密访问密钥`；
   - `存储桶的名字`填入你最初设定的名字；
   - 其他按需设置

3. 点击 **检查**，如果一切顺利，那么应该会出现如图的正确提示
	- ![检查](./s3_cloudflare_r2_09.png)

4. 所有工作已经完成，可以享受Cloudflare提供的服务了，但请注意流量资费

---

## 附加信息

### A类操作
	
| 英文操作名称 | 中文操作名称 |
|--------------|----------------|
| `ListBuckets` | 列出存储桶 |
| `PutBucket` | 创建存储桶 |
| `ListObjects` | 列出对象 |
| `PutObject` | 上传对象 |
| `CopyObject` | 复制对象 |
| `CompleteMultipartUpload` | 完成分片上传 |
| `CreateMultipartUpload` | 初始化分片上传 |
| `LifecycleStorageTierTransition` | 生命周期存储层级转换 |
| `ListMultipartUploads` | 列出分片上传 |
| `UploadPart` | 上传分片 |
| `UploadPartCopy` | 复制分片 |
| `ListParts` | 列出已上传分片 |
| `PutBucketEncryption` | 设置存储桶加密 |
| `PutBucketCors` | 设置存储桶跨域资源共享 (CORS) |
| `PutBucketLifecycleConfiguration` | 设置存储桶生命周期配置 |

---

### B 类操作

| 英文操作名称 | 中文操作名称 |
|--------------|----------------|
| `HeadBucket` | 查询存储桶是否存在 |
| `HeadObject` | 查询对象元信息 |
| `GetObject` | 下载对象 |
| `UsageSummary` | 使用情况汇总 |
| `GetBucketEncryption` | 获取存储桶加密配置 |
| `GetBucketLocation` | 获取存储桶所在区域 |
| `GetBucketCors` | 获取存储桶跨域资源共享 (CORS) 配置 |
| `GetBucketLifecycleConfiguration` | 获取存储桶生命周期配置 |

### 两种令牌的区别

Cloudflare 的账户 API 令牌和用户 API 令牌的区别，可以类比阿里云主账号（Root Account）和 RAM 子账号（RAM User）的概念

| **阿里云** | **Cloudflare** | **说明**                                   |
| -------------- | ------------------- | ------------------------------------------ |
| **主账号**     | **账户 API 令牌**   | 长期有效，权限广泛，适合生产环境。         |
| **RAM 子账号** | **用户 API 令牌**   | 与用户绑定，生命周期灵活，适合个人或开发。 |
