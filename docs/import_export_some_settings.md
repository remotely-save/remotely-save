## Bonus: Import And Export Not-Oauth2 Plugin Settings By QR Code

It's often verbose / inconvenient to input not-oauth2 credentials on mobile. (On different desktop computers, it's trivial to copy and paste `data.json` across different devices.)

So this plugin has a helper function to export those settings as a QR code, then you could use mobile device's camera to import the settings.

Attention:

1. Oauth2 - related information is omitted. It means that Dropbox, OneDrive login credentials are NOT included in the QR Code.
2. Please, NEVER share the QR Code to others. It's as equivalent to the login credentials.

Steps:

1. Configure the plugin settings on one device, and make sure the sync functions work. (E.g, you could sync notes using S3 credentials.)
2. Open plugin settings page. Then scroll down the page, until the section "Import and Export Settings". Click the button "Get QR Code". A new modal should show up and you should see a QR code.
3. On a second device, make sure the vault name is the same as the first device's.
4. On that second device, use its camera app, or any apps that support scanning QR codes, to scan the QR code from the first device. (On latest iOS, the system's built in camera app should work. On Android, at least one open source app [Binary Eye](https://github.com/markusfisch/BinaryEye) is tested to be working.)
5. A link / url / address should be identified in the scan-QR-code app, and you could follow the instruction in the app, and then you should be redirected to open the Obsidian app.
6. And finally, there should be a new notice in the Obsidian app saying the settings are successfully imported. Otherwise please check the error message in the notice.
