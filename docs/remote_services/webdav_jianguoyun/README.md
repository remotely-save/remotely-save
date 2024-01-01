# 坚果云 JianGuoYun/NutStore

## 链接 Link

<https://www.jianguoyun.com/>

## 注意！！！Attentions!!!

坚果云有限制 api 数量等设定。本插件会产生若干查询，如果文件较多很容易触发 api 上限，从而工作不正常。这不是插件 bug，也没有办法解决。

JianGuoYun/NutStore has api limits. The plugin may generate many queries, and it's possible to reach the api limits if there are many files, then do not work properly. It's not a bug and there's no way to fix this situation.

## 步骤 Steps

1. **知悉坚果云有 api 限制，本插件可能因此工作不正常。Be aware that JianGuoYun/NutStore has api limits, and the plugin may not work properly because of this.**
2. 注册账号，登录。Register an account.
3. 去“个人信息”->“安全”，“添加应用”，从而获取了 webDAV 账号（应该是 email）和 WebDAV 密码（一串特殊的字符，不等于网站密码）。Go to "settings"->"Security", click "Add Application", then obtain the WebDAV account (email), and WebDAV password (a string different from web site password).
   ![](./webdav_jianguoyun.cn.png)
4. 在 remotely-save 设置，输入网址、账号、密码、**“发送到服务器的 Depth Header”设置为“只支持 depth='1'”**。Input the WebDAV address, account, password, **Depth Header Sent To Servers="only supports depth='1'"** in remotely-save settings.
   ![](./webdav_jianguoyun_rs_settting.cn.png)
5. 在 remotely-save 设置，检查连接。In remotely-save setting page, click "Check Connectivity".
6. 同步文件！Sync!
