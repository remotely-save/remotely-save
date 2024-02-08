# Storj

## Links

<https://www.storj.io/>

## Steps

1. Register an account. Login.
2. Create a bucket.
3. Create S3 Credentials in Access Management. Allow all permissions for the bucket. Remember the access key and secret key and the end point. The end point is likely to be [`https://gateway.storjshare.io`](https://docs.storj.io/dcs/api/s3/s3-compatible-gateway).
   ![](./storj_create_s3_cred_1.png)
   ![](./storj_create_s3_cred_2.png)
4. Input your credentials into remotely-save settings. Region [should be `global`](https://docs.storj.io/dcs/api/s3/s3-compatibility).
   ![](storj_remotely_save_settings.png)
5. Check connectivity.
6. Sync!
