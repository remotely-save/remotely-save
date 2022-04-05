# Check Console Output

If you are using Obsidian on desktop or Android, you can check the Obsidian console.

## Disable Auto Sync Firstly

You should disable auto sync to avoid any unexpected running.

## Set The Output Level To Debug

Go to the plugin settings, scroll down to the section "Debug" -> "alter console log level", and change it from "info" to "debug".

## Check The Output

- If you are on desktop

  Press the keyboard shortcut "ctrl+shift+i" if you are on Windows or Linux, or press "cmd+shift+i" if you are on macOS. You should be able to see the console of Obsidian.

- If you are using Android

  You need to [enable USB debugging](https://developer.android.com/studio/debug/dev-options#enable) on your Android, then connect your Android to a computer using USB, then open the **desktop** Chrome browser and go to the special web page <chrome://inspect>. You shall be able to see the "inspect" link inside the special page, then click the link to open the console. After debugging, remember to turn off USB debugging.

Trigger the sync manually (by clicking the icon on the ribbon sidebar). Something (hopefully) helpful should show up in the console. You could understand what happened and what goes wrong more explictly by checking the output.
