# Azure Blob Storage (GDrive) (PRO)

# Intro

* It's a PRO feature of Remotely Save plugin.
* **This plugin is NOT an official Microsoft / Azure product, and just uses Azure Blob Storage's public api.**

# Disclaimer

I (author of Remotely Save) is **NOT** an expert of Azure products. The tutorials here are for references only. Azure products are very complex.

***As far as the law allows, the software (Remotely Save) comes as is, without any warranty or condition, and the licensor will not be liable to you for any damages arising out of these terms or the use or nature of the software, under any kind of legal claim.***

# Steps

Please read through the following steps before you actually connect.

## Preparation In Azure Blob Storage Side

You only need to do this **once**, before the Container SAS Url expires in the future.

In short, you need to: configure CORS and configure a policy and cobtain a Container SAS Url.

1. Connect to the service:
    
    Download Microsoft's free [Azure Storage Explorer](https://azure.microsoft.com/en-us/products/storage/storage-explorer). The following tutorial uses this app. Actually you may be able to find the same settings on Azure official website.
    
    Use this app to connect to your Blob Storage service or account.
    
2. CORS:
    
    Right click on `Blob containers`, click "configure CORS". Add a rule, enter the following and save:
    ```
    Allowed Origins: *
    Allowed Methods: DELETE,GET,HEAD,MERGE,POST,PATCH,OPTIONS,PUT
    Allowed Headers: x-ms-*, content-type
    Exposed Headers: x-ms-*, content-type
    Max Age (in seconds): 5
    ```

    ![CORS screenshot](./azure_cors.png)

3. Create the container:  
    
    Create the container if you don't have one. In this tutorial, we use `example-container`.

    ![container screenshot](./azure_example_container.png)

4. Generate a policy:
    
    * Right click on you container, click "Manage Stored Access Policies". 
    * Choose your id, for example `example-container-0000001`.
    * Change to Expiry time to an appropriate date. **By default it is only valid for a week.** After its expiration, you need come back and adjust the expiry date again! In this tutorial, we set it to a year.
    * And allow these methods: Read, Add, Create, Write, Delete, List.
    * Save
   
    Read Microsoft's official [doc](https://learn.microsoft.com/en-us/rest/api/storageservices/define-stored-access-policy) for more info. The main benefit of generating an access policy is easier revocation of SAS Url if anything goes bad. 

    ![Manage Stored Access Policies screenshot](./azure_policy_1.png)
    ![Add Policy screenshot](./azure_policy_3.png)

5. Generate a Container SAS Url:

    Then we want to create a container level SAS (shared access signature) url.

    * Right click on you container, click "Get Shared Access Signature". 
    * In access policy, choose the previous one you created: for example `example-container-0000001`.
    * Save the setting
    * You will see a url is generated, which starts with `https://` or `http://`. It should looks like `https://<account>.blob.core.windows.net/<container name>?sv=...&sig=...`
    * Save the Container SAS Url somewhere, and you will need this later.

    Read Microsoft's official [doc](https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview) for more info.

    ![Container SAS Url screenshot 1](./azure_sas_1.png)
    ![Container SAS Url screenshot 2](./azure_sas_2.png)
    
### Why so complicated in Azure settings?

Because Azure Blob Storage's api has some limitation in browser environment, so we need to configure CORS and SAS. Because we want to revoke the SAS when needed, we need to use a policy.

### Revocation

If you suspect someone read the resource unexpectedly, you can revoke the SAS by changing the name or expiry date of the policy. And generate the SAS Url again.

## Steps of Remotely Save subscription

1. Please sign up and sign in an online account, connect your plugin to your online account firstly. See [the PRO tutorial](../../pro/README.md) firstly.
2. Subscribe to "sync with Azure Blob Storage" feature online.
3. Go back to your Remotely Save plugin inside Obsidian, click "Check again" button in PRO settings. So that the plugin knows some features are enabled. In this case, sync with Azure Blob Storage should be detected.

## Steps of Connecting to your Azure Blob Storage

After you enabled the PRO feature in your Remotely Save plugin, **and prepared the Container SAS Url**, you can connect to your Azure Blob Storage account now.

1. In Remotely Save settings, change your sync service to Azure Blob Storage.
2. Input your Container SAS Url
3. Input your container name.
4. By default, the plugin will save your vault remotely with a prefix `<your vault name>/`. You can change the prefix. No prefix is not allowed.
5. Check the connection. A notice will tell you that you've connected or not.
7. Sync! The plugin will upload the fils and "folders" of your vault into your Azure Blob Storage with the preix.
8. **Read the caveats below.**

![RS setting screenshot](./azure_rs_setting.png)

# The caveats

* As of June 2024, this feature is in alpha stage. **Back up your vault before using this feature.**
