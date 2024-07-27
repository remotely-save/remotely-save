# Check "Obsidian vConsole" Output

It's quite hard to debug on mobile. But fortunately you can use another plugin to rescue!

This applies to both iOS (iPhone / iPad) and Android.

## Disable Auto Sync Firstly

You should disable auto sync to avoid any unexpected running.

## Set The Output Level To Debug

Go to the plugin settings, scroll down to the section "Debug" -> "alter console log level", and change it from "info" to "debug".

## Use "Obsidian vConsole"

1. Install the third-party plugin ["Obsidian vConsole"](https://github.com/zhouhua/obsidian-vconsole).
2. Enable "Obsidian vConsole". You shall see a green button in the right buttom corner of the interface of your mobile Obsidian. You can drag this green button to where you like.
3. Sync! And quickly click the vConsole green button, you will see the console logs in its panel! Moreover, you can check browser network and Storage (LocalStorage) in the panel! 
4. You can copy (by clicking the small "disk" icon beside each line of the log) or take a screenshot of the logs, and report bugs in Remotely Save GitHub. You can click "Hide" in the panel to hide the panel.
5. If you don't need to debug any more, you can disable Obsidian vConsole plugin, then the green button should disappear.
