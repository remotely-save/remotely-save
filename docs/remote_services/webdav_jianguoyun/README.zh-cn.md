# 坚果云

[English](./README.md) | 中文

## 链接

<https://www.jianguoyun.com/>

## 注意！！！

坚果云有限制 api 数量等设定。本插件会产生若干查询，如果文件较多很容易触发 api 上限，从而工作不正常。这不是插件 bug，也没有办法解决。

## 步骤

1. **知悉坚果云有 api 限制，本插件可能因此工作不正常。**
2. 注册账号，登录。
3. 去“个人信息”->“安全”，“添加应用”，从而获取了 webDAV 账号（应该是 email）和 WebDAV 密码（一串特殊的字符，不等于网站密码）。
   ![](./webdav_jianguoyun.cn.png)
4. 在 remotely-save 设置，输入网址、账号、密码、**“发送到服务器的 Depth Header”设置为“只支持 depth='1'”**。
   ![](./webdav_jianguoyun_rs_settting.cn.png)
5. 在 remotely-save 设置，检查连接。
6. 同步文件！
