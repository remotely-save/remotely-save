---
说明：GitHub Copilot 翻译
---
[English](/docs/how_to_debug/check_console_output.md)  | 中文

# 检查控制台输出

如果您正在使用桌面版或Android版的Obsidian，您可以检查Obsidian控制台。

## 首先禁用自动同步

您应该禁用自动同步以避免任何意外运行。

## 将输出级别设置为调试模式

进入插件设置，滚动到"Debug" -> "alter console log level"部分，并将其从"info"更改为"debug"。

## 检查输出

- 如果您在桌面上

  如果您使用的是Windows或Linux系统，请按下键盘快捷键"ctrl+shift+i"；如果您使用的是macOS，请按下"cmd+shift+i"。您应该能够看到Obsidian的控制台。

- 如果您使用的是Android

  您需要在Android上[启用USB调试](https://developer.android.com/studio/debug/dev-options#enable)，然后使用USB将Android连接到计算机，然后打开**桌面版**Chrome浏览器并转到特殊的网页<chrome://inspect>。您应该能够在特殊页面内看到"inspect"链接，然后点击该链接以打开控制台。调试完成后，请记得关闭USB调试。

手动触发同步（通过点击侧边栏上的图标）。控制台中应该会显示一些（希望有用的）信息。通过检查输出，您可以更明确地了解发生了什么以及出了什么问题。
