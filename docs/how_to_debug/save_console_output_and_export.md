English | [中文](/docs/how_to_debug/save_console_output_and_export.zh-cn.md)

# Save Console Output And Read Them Later

## Disable Auto Sync Firstly

You should disable auto sync to avoid any unexpected running.

## Set The Output Level To Debug

Go to the plugin settings, scroll down to the section "Debug" -> "alter console log level", and change it from "info" to "debug".

## Enable Saving The Output To DB

Go to the plugin settings, scroll down to the section "Debug" -> "Save Console Logs Into DB", and change it from "disable" to "enable". **This setting has some performance cost, so do NOT always turn this on when not necessary!**

## Run The Sync

Trigger the sync manually (by clicking the icon on the ribbon sidebar). Something (hopefully) helpful should show up in the console. The the console logs are also saved into DB now.

## Export The Output And Read The Logs

Go to the plugin settings, scroll down to the section "Debug" -> "Export Console Logs From DB", and click the button. A new file `log_hist_exported_on_....md` should be created inside the special folder `_debug_remotely_save/`. You could read it and hopefully find something useful.

## Disable Saving The Output To DB

After debugging, go to the plugin settings, scroll down to the section "Debug" -> "Save Console Logs Into DB", and change it from "enable" to "disable".
