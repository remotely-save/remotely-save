# JianGuoYun/NutStore

English | [中文](./README.zh-cn.md)

## Link

<https://www.jianguoyun.com/>

## Attentions!!!

JianGuoYun/NutStore has api limits. The plugin may generate many queries, and it's possible to reach the api limits if there are many files, then do not work properly. It's not a bug and there's no way to fix this situation.

## Steps

1. **Be aware that JianGuoYun/NutStore has api limits, and the plugin may not work properly because of this.**
2. Register an account.
3. Go to "settings"->"Security", click "Add Application", then obtain the WebDAV account (email), and WebDAV password (a string different from web site password).
   ![](./webdav_jianguoyun.cn.png)
4. Input the WebDAV address, account, password, **Depth Header Sent To Servers="only supports depth='1'"** in remotely-save settings.
   ![](./webdav_jianguoyun_rs_settting.cn.png)
5. In remotely-save setting page, click "Check Connectivity".
6. Sync!
