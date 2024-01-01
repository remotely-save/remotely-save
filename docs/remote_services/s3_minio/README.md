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
