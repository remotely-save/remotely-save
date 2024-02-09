---
说明：GitHub Copilot 翻译
---
[English](/docs/how_to_debug/export_sync_plans.md) | 中文

# 导出同步计划

## 这是什么？

每次插件开始同步时，它会收集所有所需的信息，生成每个文件和文件夹的“同步计划”，并分配相应的实际操作。

因此，如果出现问题，我们首先应该检查同步计划。

## 如何导出计划？

请按照以下说明进行操作。

### 首先禁用自动同步

您应该禁用自动同步以避免任何意外运行。

### 如果尚未进行手动同步

您至少应该进行一次同步，以便生成并保存至少一个同步计划。如果您之前已经同步过了，应该已经保存了一些同步计划。

### 导出到文件

转到插件设置，滚动到“调试”->“导出同步计划”部分，然后点击“导出”按钮。**它会在您的存储库中生成一个名为`_debug_remotely_save/`的新文件夹，并在该文件夹中生成一个名为`sync_plans_hist_exported_on_{a_timestamp}.md`的文件。

## 如何阅读计划

打开生成的`sync_plans_hist_exported_on_{a_timestamp}.md`文件。您应该会看到一个JSON，或者多个JSON。每个JSON代表一个同步计划。

同步计划的结构如下：

```json
{
  "ts": 1646960867560,
  "remoteType": "onedrive",
  "mixedStates": {
    "abc.md": {
      "key": "abc.md",
      "existRemote": true,
      "mtimeRemote": 1646566632000,
      "sizeRemote": 56797,
      "remoteEncryptedKey": "abc.md",
      "changeMtimeUsingMapping": true,
      "existLocal": true,
      "mtimeLocal": 1646566632000,
      "sizeLocal": 56797,
      "decision": "skipUploading",
      "decisionBranch": 1
    },
    "New folder/": {
      "key": "New folder/",
      "deltimeRemote": 1646925354372,
      "existLocal": false,
      "existRemote": false,
      "decision": "keepRemoteDelHistFolder",
      "decisionBranch": 9
    }
  }
}
```

通常我们关注`mixedStates`属性。正如您可能猜到的，`mixedStates`中的每个项目代表一个文件或文件夹。

我们应该找到我们感兴趣的文件/文件夹（或者我们认为出了问题的文件/文件夹），然后查看以下属性：

```
decision
    决策结果。

decisionBranch
    同步代码中实际逻辑的标记。用于调试。

existRemote
    文件/文件夹是否存在于远程服务中？

mtimeRemote
    远程服务上的“最后修改时间”。

deltimeRemote
    远程记录的“删除时间”。

existLocal
    文件/文件夹是否存在于本地？

mtimeLocal
    本地的“最后修改时间”和“创建时间”的较大值。

deltimeLocal
    本地的“删除时间”。
```

`decision`应该根据修改时间和删除时间来确定，根据[同步算法文档](../sync_algorithm_v2.md)中描述的逻辑进行判断。简而言之，我们收集四个时间戳（`mtimeRemote`、`deltimeRemote`、`mtimeLocal`、`deltimeLocal`），并尊重最大时间戳及其对应的操作。

## 常见问题

一些用户报告称，他们的“最后修改时间”或“创建时间”未被操作系统正确设置。在这种情况下，插件无法进行任何操作，因为它是通过比较时间戳来确定同步计划的。建议检查操作系统的设置或检查其他程序是否对文件进行了操作。
