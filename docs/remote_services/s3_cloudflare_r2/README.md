# Cloudflare R2

## Links

<https://www.cloudflare.com/developer-platform/r2/>

## Steps

1. **Be aware that it may cost you money.**
2. Create a Cloudflare account and enable R2 feature. **Credit card info might be required by Cloudflare**, though Cloudflare provides generous free tier and zero egress fee.
3. Create a bucket.
   ![](./s3_cloudflare_r2_create_bucket.png)
4. Create an Access Key with "Object Read & Write" permission, and add specify to your created bucket. During the creation, you will also get the auto-generated secret key, and the endpoint address.
   ![](./s3_cloudflare_r2_create_api_token.png)
5. In remotely-save setting page, input the address / bucket / access key / secret key. **Region being set to `us-east-1` is sufficient.** Enable "Bypass CORS", because usually that's what you want.

   Click "check connectivity". (If you encounter an issue and sure the info are correct, please upgrade remotely-save to **version >= 0.3.29** and try again.)

   ![](./s3_cloudflare_r2_rs_settings.png)

6. Sync!

## And Issue Related To "Check Connectivity"

If you encounter an issue and sure the info are correct, please upgrade remotely-save to **version >= 0.3.29** and try again.

Cloudflare doesn't allow `HeadBucket` for access keys with "Object Read & Write". So it may be possible that checking connectivity is not ok but actual syncing is ok. New version >= 0.3.29 of the plugin fix this problem by using `ListObjects` instead of `HeadBucket`.
