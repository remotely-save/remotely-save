English | [中文](/docs/remote_services/s3_minio/README.zh-cn.md)

# MinIO

## Links

<https://min.io/>

## Steps

1. Configure your minio instance and get an account.
2. Create an Access Key (during the creation, you will also get the auto-generated secret key).
   ![](./minio_access_key.png)
3. Check or set the region.
   ![](./minio_region.png)
4. Create a bucket.
   ![](./minio_create_bucket.png)
5. In remotely-save setting page, input the address / bucket / access key / secret key. **Usually minio instances may need "S3 URL style"="Path Style".** Enable "Bypass CORS", because usually that's what you want.
   ![](./minio_rs_settings.png)
6. Sync!
   ![](./minio_sync_success.png)

## Ports In Address

Just type in the full address with `http(s)://` and `:port` in remotely-save settings, for example `http://192.168.31.198:9000`.

It's verified that everything is ok.

![](./minio_custom_port.png)
