# How to receive `obsidian://` in Linux

## Background

For example, when we are authorizing OneDrive, we have to jump back to Obsidian automatically using `obsidian://`.

## Short Desc From Official Obsidian Doc

Official doc has some explanation:

<https://help.obsidian.md/Extending+Obsidian/Obsidian+URI#Register+Obsidian+URI>

# Long Desc

Assuming the username is `somebody`, and the `.AppImage` file is downloaded to `~/Desktop`.

1. Download and **extract** the app image file in terminal

   ```bash
   cd /home/somebody/Desktop
   chmod +x Obsidian-x.y.z.AppImage
   ./Obsidian-x.y.z.AppImage --appimage-extract

   # you should have the folder squashfs-root
   # we want to rename it
   mv squashfs-root Obsidian
   ```

2. Create a `.desktop` file

   ```bash
   # copy and paste the follow MULTI LINE command
   # you might need to input your password because it requires root privilege
   # remember to adjust the path
   cat > ~/Desktop/obsidian.desktop <<EOF
   [Desktop Entry]
   Name=Obsidian
   Comment=obsidian
   Exec=/home/somebody/Desktop/Obsidian/obsidian %u
   Keywords=obsidian
   StartupNotify=true
   Terminal=false
   Type=Application
   Icon=/home/somebody/Desktop/Obsidian/obsidian.png
   MimeType=x-scheme-handler/obsidian;
   EOF

   # yeah we can check out the output
   cat ~/Desktop/obsidian.desktop
   ## [Desktop Entry]
   ## ...
   ```

3. Right click the `obsidian.desktop` file on the Desktop, and click "Allow launching"

4. Double click the `obsidian.desktop` file.
