<!---
说明：GitHub Copilot 翻译
--->
[English](/README.md) | 中文

# Remotely Save

这是另一个非官方的 Obsidian 同步插件。如果您喜欢它或发现它有用，请考虑在 Github 上给它一个 [Star ![GitHub Repo stars](https://img.shields.io/github/stars/fyears/remotely-save?style=social)](https://github.com/fyears/remotely-save)。

[![BuildCI](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml/badge.svg)](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml)

[![downloads of latest version](https://img.shields.io/github/downloads-pre/remotely-save/remotely-save/latest/main.js?sort=semver)](https://github.com/fyears/remotely-save/releases)
## 免责声明

- **这不是 Obsidian 提供的[官方同步服务](https://obsidian.md/sync)。**

## !!!注意!!!

**在使用此插件之前，务必备份您的 vault。**

## 功能

- 支持以下服务：
    - Amazon S3 或兼容服务（Cloudflare R2 / BackBlaze B2 / MinIO / ...）
    - Dropbox
    - OneDrive 个人版
    - Webdav
    - [这里](./docs/services_connectable_or_not.zh-cn.md)详细列出了更多可连接（或不可连接）的服务。
- **支持 Obsidian 移动版。** 可以通过云服务在移动设备和桌面设备之间同步 vault。
- **支持端到端加密**。如果用户指定密码，文件将在发送到云端之前使用 openssl 格式进行加密。
- **支持定时自动同步**。您还可以使用侧边栏上的按钮手动触发同步，或者使用命令面板中的命令（甚至将热键组合绑定到命令）。
- **[最小干扰设计](/docs/minimal_intrusive_design.zh-cn.md)。**
- **通过自定义正则条件跳过大文件**和**跳过路径**！
- **完全开源，遵循 [Apache-2.0 许可证](./LICENSE)。**
- **[同步算法开放](./docs/sync_algorithm_v2.zh-cn.md)供讨论。**

## 限制

- **为了支持删除同步，额外的元数据也将被上传。** 请参阅[最小干扰设计](./docs/minimal_intrusive_design.zh-cn.md)。
- **没有冲突解决。没有内容差异和补丁算法。** 所有文件和文件夹都使用它们的本地和远程“最后修改时间”进行比较，以最后修改时间较晚的为准。
- **云服务会产生费用。** 请始终注意费用和定价。具体而言，包括但不限于下载、上传、列出所有文件、调用任何 API、存储大小等操作可能会产生费用。
- **浏览器环境的一些限制。** 更多技术细节请参阅[文档](./docs/browser_env.zh-cn.md)。
- **您应该保护您的 `data.json` 文件。** 该文件包含敏感信息。
    - 强烈建议**不要**与任何人共享您的 `data.json` 文件。
    - 通常**不建议**将该文件提交到版本控制中。默认情况下，如果插件目录中不存在 `.gitignore` 文件，插件会尝试创建一个 `.gitignore` 文件，用于在 `git` 版本控制中忽略 `data.json`。如果您确切地知道它的含义并希望删除该设置，请修改 `.gitignore` 文件或将其设置为空。

## 问题、建议或错误报告

非常欢迎您提出问题、提出建议或报告错误！该项目主要在 GitHub 上维护：

- 问题：[GitHub discussions](https://github.com/fyears/remotely-save/discussions)
- 建议：也在[GitHub discussions](https://github.com/fyears/remotely-save/discussions)
- 错误报告：[GitHub issues](https://github.com/fyears/remotely-save/issues)（非讨论）

此外，插件作者可能会偶尔访问 Obsidian 官方论坛和官方 Discord 服务器，并关注与该插件相关的信息。

## 下载和安装

- 选项 #1：在官方的“社区插件列表”中搜索，或访问此链接：[https://obsidian.md/plugins?id=remotely-save](https://obsidian.md/plugins?id=remotely-save)（应该会将您重定向到 Obsidian 应用程序），然后安装插件。
- 选项 #2：您还可以使用 [Obsidian42 - BRAT](https://github.com/TfTHacker/obsidian42-brat) 来安装此插件。在 BRAT 的配置中输入 `fyears/remotely-save`。
- 选项 #3：[![GitHub release (latest by SemVer and asset including pre-releases)](https://img.shields.io/github/downloads-pre/fyears/remotely-save/latest/main.js?sort=semver)](https://github.com/fyears/remotely-save/releases) 从最新版本手动下载资源（`main.js`、`manifest.json`、`styles.css`）。
- 选项 #4：[![BuildCI](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml/badge.svg)](https://github.com/fyears/remotely-save/actions/workflows/auto-build.yml) 每个成功构建下方的“摘要”中都会放置所有构建的产物。它是由每个提交自动生成的，可能会出现问题。

## 使用方法

### S3

- 教程 / 示例：
    - [Cloudflare R2](./docs/remote_services/s3_cloudflare_r2/README.zh-cn.md)
    - [BackBlaze B2](./docs/remote_services/s3_backblaze_b2/README.zh-cn.md)
    - [Storj](./docs/remote_services/s3_storj_io/README.zh-cn.md)
    - [腾讯云 COS](./docs/remote_services/s3_tencent_cloud_cos/README.zh-cn.md) | [Tencent Cloud COS](./docs/remote_services/s3_tencent_cloud_cos/README.md)
    - [MinIO](./docs/remote_services/s3_minio/README.md)
- 准备 S3（兼容）服务的信息：[终端节点、区域](https://docs.aws.amazon.com/general/latest/gr/s3.html)、[访问密钥 ID、秘密访问密钥](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html)、存储桶名称。存储桶应为空，并且仅用于同步 vault。
- 如果您使用的是 AWS S3，请创建[策略和用户](./docs/remote_services/s3_general/s3_user_policy.md)。
- 旧版本的 Obsidian 需要[配置 CORS](./docs/remote_services/s3_general/s3_cors_configure.md)。
- 下载并启用此插件。
- 在插件的设置中输入您的信息。
- 如果要启用端到端加密，请在设置中设置密码。如果不指定密码，则文件和文件夹将以明文原始内容同步到云端。
- 每次您想在本地和远程之间同步 vault 时，单击侧边栏上的新“圆形箭头”图标（左侧边栏）。（或者，您可以在设置面板中配置自动同步（见下一章）。）同步时，图标会变成“两个半圆形箭头”。除了单击侧边栏上的图标，您还可以在命令面板中激活相应的命令。
- **同步时请耐心等待。** 特别是在首次同步时。

### Dropbox

- **此插件不是 Dropbox 的官方产品。** 该插件只使用 Dropbox 的公共 API。
- 授权后，插件可以读取您的姓名和电子邮件（无法在 Dropbox API 上取消选择），并在您的 Dropbox 的 `/Apps/remotely-save` 文件夹中读取和写入文件。
- 如果您决定授权此插件连接到 Dropbox，请转到插件的设置，选择 Dropbox，然后按照说明操作。[此处有更多带有截图的信息](./docs/dropbox_review_material/README.md)。
- 也支持基于密码的端到端加密。但请注意，**vault 名称本身不会被加密**。

### OneDrive 个人版

- **此插件不是 Microsoft / OneDrive 的官方产品。** 该插件只使用 Microsoft 的 [OneDrive 的公共 API](https://docs.microsoft.com/en-us/onedrive/developer/rest-api)。
- 此插件仅适用于“OneDrive 个人版”，不适用于“OneDrive 商业版”（尚未支持）。有关详细信息，请参见[#11](https://github.com/fyears/remotely-save/issues/11)。
- 授权后，插件可以读取您的姓名和电子邮件，并在您的 OneDrive 的 `/Apps/remotely-save` 文件夹中读取和写入文件。
- 如果您决定授权此插件连接到 OneDrive，请转到插件的设置，选择 OneDrive，然后按照说明操作。
- 也支持基于密码的端到端加密。但请注意，**vault 名称本身不会被加密**。

### webdav

- 教程 / 示例：
    - [ownCloud](./docs/remote_services/webdav_owncloud/README.md)
    - [InfiniCloud](./docs/remote_services/webdav_infinicloud_teracloud/README.md)
    - [Synology webdav server](./docs/remote_services/webdav_synology_webdav_server/README.md) | [群晖 webdav server](./docs/remote_services/webdav_synology_webdav_server/README.zh-cn.md)
    - [AList（中文）](./docs/remote_services/webdav_alist/README.zh-cn.md) | [AList (English)](./docs/remote_services/webdav_alist/README.md)
    - [坚果云](./docs/remote_services/webdav_jianguoyun/README.zh-cn.md) | [JianGuoYun/NutStore](./docs/remote_services/webdav_jianguoyun/README.md)
- 旧版本的 Obsidian 需要[配置 CORS](./docs/remote_services/webdav_general/webav_cors.zh-cn.md)。
- 您的数据将同步到您的 webdav 服务器上的 `${vaultName}` 子文件夹中。
- 也支持基于密码的端到端加密。但请注意，**vault 名称本身不会被加密**。

## 定时自动同步

- 您可以在设置中配置每隔 N 分钟自动同步一次。
- 在自动同步模式下，如果发生任何错误，插件将**静默失败**。
- 自动同步仅在 Obsidian 被打开时起作用。在 Obsidian 处于后台时自动同步是**技术上不可能的**，因为插件只在 Obsidian 提供的浏览器环境中工作。

## 如何处理隐藏文件或文件夹

**默认情况下，所有以 `.`（点）或 `_`（下划线）开头的文件或文件夹都被视为隐藏文件，不会被同步。** 如果您有一些仅保留在本地的文件，这很有用。但是，这种策略也意味着主题/其他插件/此插件的设置也不会被同步。

在最新版本中，您可以更改设置，允许同步 `_` 文件或文件夹，以及 `.obsidian` 特殊配置文件夹（但不包括其他 `.` 文件或文件夹）。

## 如何调试

有关详细信息，请参阅[此处](./docs/how_to_debug/README.zh-cn.md)。

## 附加功能：通过 QR 码导入和导出非 OAuth2 插件设置

有关详细信息，请参阅[此处](./docs/import_export_some_settings.zh-cn.md)。
