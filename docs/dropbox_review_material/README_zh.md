---
说明：GitHub Copilot 翻译
---
[English](/docs/dropbox_review_material/README.md) | 中文  

## 材料来源

为了申请使用Dropbox API的生产环境，需要提交一些描述信息给Dropbox。巧合的是，这也可以作为使用此插件与Dropbox配合的“自述文件”。

## 一些背景

1. Obsidian允许用户使用Markdown文件进行笔记。
2. “app” remotely-save 是一个非官方的Obsidian插件，帮助用户从Dropbox下载和上传（“同步”）他们的笔记。
3. 从技术上讲，remotely-save是使用Web技术开发的。

## API使用

1. remotely-save使用“App文件夹”来避免不必要地访问用户的其他文件。
2. remotely-save使用“account_info.read”来获取显示的用户名，以便用户在OAuth步骤后知道已登录其哪个帐户。
3. remotely-save使用“files.content.read”来读取Dropbox上文件的“上次修改时间”和内容。在某些条件下，插件会下载文件。例如，插件会比较本地设备上的文件的上次修改时间戳和Dropbox上的时间戳，如果Dropbox上的时间戳较大，插件会将“更新”的文件从Dropbox下载到本地。
4. remotely-save使用“files.content.write”来上传或覆盖Dropbox上文件的内容。在某些条件下，插件会执行此操作。例如，插件会比较本地设备上的文件的上次修改时间戳和Dropbox上的时间戳，如果本地设备上的时间戳较大，插件会将本地的“更新”文件上传到Dropbox，并覆盖Dropbox上的文件。

## 步骤

以下是查看remotely-save功能的步骤。

大多数步骤都有截图。

1. 从Obsidian的官方网站（https://obsidian.md/）下载笔记应用程序Obsidian（Windows或Mac版本都可以）。它是免费下载和使用的。然后安装它。
2. 打开Obsidian，在“创建新保险库”下点击“创建”按钮。
3. 选择一个保险库名称，例如“example-vault”，选择一个位置，然后点击“创建”。
   ![step03](./attachments/step03.png)
4. 如果有更新提示，请关闭任何更新。
5. 点击左侧的按钮创建一个新的笔记。然后在笔记上写点东西。
   ![step05](./attachments/step05.png)
6. 点击侧边栏左侧的“设置”（齿轮图标）。
   ![step06](./attachments/step06.png)
7. 在设置面板中，转到“社区插件”页面，关闭安全模式，并确认关闭安全模式。然后点击“浏览”按钮以查看社区插件。
   ![step07](./attachments/step07.png)
8. 搜索“Remotely Save”并在结果中安装。
   ![step08](./attachments/step08.png)
9. 安装插件成功后，返回“社区插件”页面，启用该插件。
   ![step09](./attachments/step09.png)
10. 转到新添加的“Remotely Save”设置，选择“Dropbox”作为“选择服务”，然后点击“授权”按钮。
    ![step10](./attachments/step10.png)
11. 显示标准的授权流程地址，用户应点击该地址，并在网站上完成授权步骤。最后，Dropbox网站应自动将用户重定向回Obsidian应用程序。
    ![step11](./attachments/step11.png)
12. “授权”按钮消失。出现一个新的“撤销授权”按钮。
    ![step12](./attachments/step12.png)
13. 返回Obsidian的主界面，左侧边栏应出现一个新的“切换图标”。点击它，然后插件将触发同步进程。它会比较本地文件和远程文件（在Dropbox上）的元信息，并决定下载一些文件和/或上传一些文件。
    ![step13](./attachments/step13.png)
14. 创建、编辑、删除一些笔记，并重复步骤13，Dropbox上的文件也应该随着本地的更改而改变。
