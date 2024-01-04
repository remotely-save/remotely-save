# Backblaze B2

## Links

https://www.backblaze.com/cloud-storage

## Steps

1. Create a Backblaze account [on this page](https://www.backblaze.com/cloud-storage). Credit card info *is not* required. Backblaze B2 offers 10 GB of free storage.
2. Create a **bucket**, you can leave the default settings:
   ![Screenshot 2024-01-04 143419](https://github.com/vardecab/remotely-save/assets/6877391/2ff593f5-5ee9-441c-be45-c094e2979945)
   ![Screenshot 2024-01-04 143622](https://github.com/vardecab/remotely-save/assets/6877391/120c2042-f297-4dda-8aef-4c9cb9dde849)
4. Copy `Endpoint`, eg. `s3.us-east-005.backblazeb2.com` — it'll be used later.
5. Copy `bucketname` near the 🪣 icon — it'll be used later.
   ![Screenshot 2024-01-04 150122](https://github.com/vardecab/remotely-save/assets/6877391/3cf433e7-4a6f-4052-8225-39a26e028ad1)
6. Go to **Application Keys**:

     ![Screenshot 2024-01-04 143849](https://github.com/vardecab/remotely-save/assets/6877391/dc8f35c5-38f6-4f3e-8796-034063594b29)
   
8. **Add a new key**: 
   ![Screenshot 2024-01-04 143908](https://github.com/vardecab/remotely-save/assets/6877391/94e4e97d-938d-432d-b616-3c9b85dd3939)
   ![Screenshot 2024-01-04 144001](https://github.com/vardecab/remotely-save/assets/6877391/a453bd4d-2dba-4a53-bd6b-1d85840df0d3)
9. Save `keyID` and `applicationKey` — they will be used later.
10. Go to Remotely Save settings in Obsidian and: 
	- Choose `S3 or compatibile` in **Remote Service**:
	- Copy `Endpoint` from Backblaze (see 3. above) to `Endpoint` in Remotely Save
	- From `endpoint` take `region` (eg. `us-east-005`) and paste it in `endpoint` in Remotely Save
	- Copy `keyID` (see 7. above) to `Access Key ID` in Remotely Save
	- Copy `applicationKey` (see 7. above) to `Secret Access Key` in Remotely Save
	- Copy `bucketname` (see 4. above) to `Bucket Name` in Remotely Save
	  ![Screenshot 2024-01-04 150414](https://github.com/vardecab/remotely-save/assets/6877391/a87e09cd-933a-45d8-8e7a-24a402179da1)

11. **Enable CORS**:
   ![Screenshot 2024-01-04 145733](https://github.com/vardecab/remotely-save/assets/6877391/048aacb1-6f01-4062-ac8d-4b77d582b57e)

12. Click **Check** in _Check Connectivity_ to see if you can connect to B2 bucket:
	![Screenshot 2024-01-04 145859](https://github.com/vardecab/remotely-save/assets/6877391/27e8b690-1f2c-447d-83e4-e50183586a8c)

13. Sync!
    
  ![Screenshot 2024-01-04 145953](https://github.com/vardecab/remotely-save/assets/6877391/c372b0cd-e967-42e7-8c1d-0a06d3eb4481)

