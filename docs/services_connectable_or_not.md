# services connectability

Here is an overview of the connectability ("connectable" or "not connectable" or "in the plan" or "never") to some services by this plugin.

The plugin works under the browser environment in Obsidian, so CORS is an issue. Obsidian starts to provide a rich API `requestUrl` for desktop version >= 0.13.25, mobile >= 1.1.1 to bypass the CORS issue. But if the users are still using an older version of Obsidian, they need to configure CORS on server.

The list is for information purposes only.


| Service | Connectable | by S3 | by WebDAV | by other protocol |
| ------ | ------ | ------ | ------ | ------ |
| Amazon S3 | Yes | Yes | | |
| Tencent Cloud - Cloud Object Storage (COS) 腾讯云对象存储 | Yes | Yes | | |
| Alibaba Cloud - Object Storage Service 阿里云对象存储 | Yes | Yes | | |
| Backblaze B2 Cloud Storage | Yes | Yes | | |
| [Wasabi](https://wasabi.com) | ? | ? | | |
| [filebase](https://filebase.com/) | Yes | Yes | | |
| QingStor 青云 | ? | ? | | |
| [MinIO](https://min.io/) | Yes | Yes | | |
| [WsgiDAV](https://github.com/mar10/wsgidav) | Yes | | Yes | |
| [Nginx `ngx_http_dav_module`](http://nginx.org/en/docs/http/ngx_http_dav_module.html) | Yes | | Yes | |
| NextCloud | Yes | | Yes | |
| OwnCloud | Yes? | | Yes? | |
| Seafile | Yes | | Yes | |
| `rclone serve webdav` | Yes | | Yes | |
| [Nutstore 坚果云](https://www.jianguoyun.com/) | Yes (partially) | | Yes (partially) | |
| [TeraCLOUD](https://teracloud.jp/en/) | Yes | | Yes | |
| Seafile | ? | | ? | ? |
| Dropbox | Yes | | | Yes |
| OneDrive for personal | Yes | | | Yes |
| OneDrive for Business | Yes | | | ? |
| Google Drive | Yes (with limitations) (PRO) | | | Yes (with limitations) (PRO) |
| [Box](https://www.box.com/) | Yes (PRO) | | | Yes (PRO) |
| [pCloud](https://www.pcloud.com/) | Yes (PRO) | | Yes | Yes (PRO) |
| Google Cloud Storage | ? | | | May be possible but needs further development. |
| Microsoft Azure Blob Storage | ? | | | May be possible but needs further development. |
| [OpenStack Storage (Swift)](https://github.com/openstack/swift) | ? | | | May be possible but needs further development. |
| <https://put.io/> | ? | | | ? |
| Yandex Disk | Yes (PRO) | | Yes | Yes (PRO) |
| FTP / FTPS | Never | | | Technically never possible to be implemented. |
| SFTP | Never | | | Technically never possible to be implemented. |
| Jottacloud | No | | | No. It seems that no open api is available. |
| Mega | Never | | | No. No js api is available. |
| Git | Never | | | No. Technically very hard, if not impossible, to be implemented. |
| [Koofr](https://koofr.eu/) | ? | | ? | ? |
| [Blomp](https://www.blomp.com/) | ? | | | May be possible but needs further development. |
