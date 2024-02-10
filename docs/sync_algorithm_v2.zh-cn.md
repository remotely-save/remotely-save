<!---
说明：GitHub Copilot 翻译
--->
[English](/docs/sync_algorithm_v2.md) | 中文

# 同步算法 V2

## 数据源

我们有四个记录数据源：

1. 本地文件。通过在本地扫描所有文件来获取。实际上，Obsidian 提供了一个直接返回此信息的 API。
2. 远程文件。通过在远程服务上扫描所有文件来获取。某些服务提供了一个直接返回此信息的 API，而其他一些服务则需要插件递归扫描文件夹。
3. 本地的“删除或重命名”历史记录。通过使用 Obsidian 的跟踪 API 记录。因此，如果用户在 Obsidian 之外删除或重命名文件/文件夹，我们无法做任何操作。
4. 远程的“删除”历史记录。由插件在每次同步中上传。

假设所有数据源都是可靠的。

## 处理它们

我们列出所有互斥且完全穷尽的组合。

### 文件

简而言之，我们收集四个时间戳，并尊重最大时间戳及其对应的操作。

| t1             | t2             | t3             | t4             | 需要执行的本地文件操作 | 需要执行的远程文件操作 | 需要执行的本地删除历史操作 | 需要执行的远程删除历史操作 | 是否等同于同步 V2 分支 |
| -------------- | -------------- | -------------- | -------------- | ---------------- | ----------------- | ----------------------- | ------------------------ | ----------------------- |
| mtime_remote   | mtime_local    | deltime_remote | deltime_local  | 如果存在则删除    | 如果存在则删除     | 清理                    | 上传本地删除历史记录      |                         |
| mtime_local    | mtime_remote   | deltime_remote | deltime_local  | 如果存在则删除    | 如果存在则删除     | 清理                    | 上传本地删除历史记录      |                         |
| mtime_remote   | deltime_remote | mtime_local    | deltime_local  | 如果存在则删除    | 如果存在则删除     | 清理                    | 上传本地删除历史记录      |                         |
| deltime_remote | mtime_remote   | mtime_local    | deltime_local  | 如果存在则删除    | 如果存在则删除     | 清理                    | 上传本地删除历史记录      |                         |
| mtime_local    | deltime_remote | mtime_remote   | deltime_local  | 如果存在则删除    | 如果存在则删除     | 清理                    | 上传本地删除历史记录      |                         |
| deltime_remote | mtime_local    | mtime_remote   | deltime_local  | 如果存在则删除    | 如果存在则删除     | 清理                    | 上传本地删除历史记录      | 8                       |
| mtime_remote   | mtime_local    | deltime_local  | deltime_remote | 如果存在则删除    | 如果存在则删除     | 清理                    | 保留                    |                         |
| mtime_local    | mtime_remote   | deltime_local  | deltime_remote | 如果存在则删除    | 如果存在则删除     | 清理                    | 保留                    |                         |
| mtime_remote   | deltime_local  | mtime_local    | deltime_remote | 如果存在则删除    | 如果存在则删除     | 清理                    | 保留                    |                         |
| deltime_local  | mtime_remote   | mtime_local    | deltime_remote | 如果存在则删除    | 如果存在则删除     | 清理                    | 保留                    |                         |
| mtime_local    | deltime_local  | mtime_remote   | deltime_remote | 如果存在则删除    | 如果存在则删除     | 清理                    | 保留                    |                         |
| deltime_local  | mtime_local    | mtime_remote   | deltime_remote | 如果存在则删除    | 如果存在则删除     | 清理                    | 保留                    |                         |
| mtime_remote   | deltime_remote | deltime_local  | mtime_local    | 跳过             | 上传本地文件       | 清理                    | 清理                     |                         |
| deltime_remote | mtime_remote   | deltime_local  | mtime_local    | 跳过             | 上传本地文件       | 清理                    | 清理                     | 10                      |
| mtime_remote   | deltime_local  | deltime_remote | mtime_local    | 跳过             | 上传本地文件       | 清理                    | 清理                     |                         |
| deltime_local  | mtime_remote   | deltime_remote | mtime_local    | 跳过             | 上传本地文件       | 清理                    | 清理                     |                         |
| deltime_remote | deltime_local  | mtime_remote   | mtime_local    | 跳过             | 上传本地文件       | 清理                    | 清理                     | 2;3;4;5;6               |
| deltime_local  | deltime_remote | mtime_remote   | mtime_local    | 跳过             | 上传本地文件       | 清理                    | 清理                     |                         |
| mtime_local    | deltime_remote | deltime_local  | mtime_remote   | 下载远程文件      | 跳过              | 清理                    | 清理                     |                         |
| deltime_remote | mtime_local    | deltime_local  | mtime_remote   | 下载远程文件      | 跳过              | 清理                    | 清理                     | 7;9                     |
| mtime_local    | deltime_local  | deltime_remote | mtime_remote   | 下载远程文件      | 跳过              | 清理                    | 清理                     |                         |
| deltime_local  | mtime_local    | deltime_remote | mtime_remote   | 下载远程文件      | 跳过              | 清理                    | 清理                     |                         |
| deltime_remote | deltime_local  | mtime_local    | mtime_remote   | 下载远程文件      | 跳过              | 清理                    | 清理                     | 1;9                     |
| deltime_local  | deltime_remote | mtime_local    | mtime_remote   | 下载远程文件      | 跳过              | 清理                    | 清理                     |                         |

### 文件夹

实际上，我们不使用任何文件夹的元数据。因此，唯一相关的信息是它们的名称，而 mtime 实际上是可以忽略的。

1. 首先生成所有文件的计划。如果存在任何文件，则其父文件夹都应该存在。如果本地不存在应存在的文件夹，则本地应递归创建它。如果远程不存在应存在的文件夹，则远程应递归创建它。
2. 然后，文件夹是可删除的，当且仅当满足以下所有条件：

   - 它在远程删除历史记录中出现
   - 它是空的，或者它的所有子文件夹都是可删除的

   一些示例：

   - 用户在设备 1 中删除文件夹，然后从设备 1 同步，然后在设备 2 中创建同名文件夹，然后从设备 2 同步。文件夹在设备 2 上被删除（再次）。
   - 用户在设备 1 中删除文件夹，然后从设备 1 同步，然后在设备 2 中创建同名文件夹，**然后在其中创建一个新文件**，然后从设备 2 同步。由于有新文件，文件夹被**保留**而不是删除，在设备 2 上。
   - 用户在设备 1 中删除文件夹，然后从设备 1 同步，然后在设备 2 中不触碰同名文件夹，然后从设备 2 同步。文件夹及其未触碰的子文件应在设备 2 上被删除。
