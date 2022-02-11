# services connectability

Here is an overview of the connectability ("connectable" or "not connectable" or "in the plan" or "never") to some services by this plugin.

The list is for information purposes only.

| Service                                                                               | Connectable | by S3 | by WebDAV | by other protocol | More Info                                                    |
| ------------------------------------------------------------------------------------- | ----------- | ----- | --------- | ----------------- | ------------------------------------------------------------ |
| Amazon S3                                                                             | Yes         | Yes   |           |                   | [CORS config needed.](./s3_cors_configure.md)                |
| Tencent Cloud - Cloud Object Storage (COS) 腾讯云对象存储                             | Yes         | Yes   |           |                   | CORS config needed.                                          |
| Alibaba Cloud - Object Storage Service 阿里云对象存储                                 | Yes         | Yes   |           |                   | CORS config needed.                                          |
| Backblaze B2 Cloud Storage                                                            | No          | No    |           |                   | Its CORS rules doesn't allow no-http(s) origins.             |
| [Wasabi](https://wasabi.com)                                                          | ?           | ?     |           |                   |                                                              |
| [filebase](https://filebase.com/)                                                     | Yes         | Yes   |           |                   | CORS config needed.                                          |
| QingStor 青云                                                                         | ?           | ?     |           |                   |                                                              |
| [MinIO](https://min.io/)                                                              | ?           | ?     |           |                   |                                                              |
| [WsgiDAV](https://github.com/mar10/wsgidav)                                           | Yes         |       | Yes       |                   | CORS rules can be set.                                       |
| [Nginx `ngx_http_dav_module`](http://nginx.org/en/docs/http/ngx_http_dav_module.html) | ?           |       | ?         |                   | Should be possible?                                          |
| NextCloud                                                                             | No?         |       | No?       |                   | No CORS config by default.                                   |
| OwnCloud                                                                              | No?         |       | No?       |                   | No CORS config by default.                                   |
| Seafile                                                                               | ?           |       | ?         |                   |                                                              |
| `rclone serve webdav`                                                                 | No          |       | No        |                   | No CORS support.                                             |
| [Nutstore 坚果云](https://www.jianguoyun.com/)                                        | No          |       | No        |                   | No CORS support.                                             |
| [TeraCLOUD](https://teracloud.jp/en/)                                                 | No          |       | No        |                   | No CORS support.                                             |
| Dropbox                                                                               | Yes         |       |           | Yes               |                                                              |
| OneDrive for personal                                                                 | Yes         |       |           | Yes               |                                                              |
| OneDrive for Business                                                                 | In the plan |       |           | ?                 |                                                              |
| Google Drive                                                                          | In the plan |       |           | ?                 |                                                              |
| [Box](https://www.box.com/)                                                           | ?           |       |           | ?                 | May be possible but needs further development.               |
| Google Cloud Storage                                                                  | ?           |       |           | ?                 | May be possible but needs further development.               |
| Microsoft Azure Blob Storage                                                          | ?           |       |           | ?                 | May be possible but needs further development.               |
| [OpenStack Storage (Swift)](https://github.com/openstack/swift)                       | ?           |       |           | ?                 | May be possible but needs further development.               |
| https://put.io/                                                                       | ?           |       |           | ?                 |                                                              |
| Yandex Disk                                                                           | ?           |       |           | ?                 |                                                              |
| FTP / FTPS                                                                            | Never       |       |           | No                | Technically never possible to be implemented.                |
| SFTP                                                                                  | Never       |       |           | No                | Technically never possible to be implemented.                |
| Jottacloud                                                                            | No          |       |           | No                | It seems that no open api is available.                      |
| Mega                                                                                  | Never       |       |           | No                | No js api is available.                                      |
| Git                                                                                   | Never       |       |           | No                | Technically very hard, if not impossible, to be implemented. |
|                                                                                       |             |       |           |                   |                                                              |
