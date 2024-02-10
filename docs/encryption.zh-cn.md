<!---
说明：GitHub Copilot 翻译
--->
[English](/docs/encryption.md) | 中文

# Encryption

如果设置了密码，文件在发送到云端之前会进行加密。

加密算法的设计与openssl格式保持一致。

1. 加密算法使用web-crypto实现。
2. 文件内容使用openssl格式进行加密。假设有一个名为`sometext.txt`的文件，密码为`somepassword`，则加密等同于以下命令：

   ```bash
   # file content encryption (ignoring file path encryption)
   openssl enc -p -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:somepassword -in ./sometext.txt -out ./sometext.txt.enc

   # file content decryption (ignoring file path decryption)
   openssl enc -d -p -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:somepassword -in ./sometext.txt.enc -out ./sometext.txt
   ```

3. 文件/目录路径字符串使用openssl以二进制模式进行加密，然后应用`不带填充的base64url`。
    假设文件路径为`a-folder-文件夹/a-file-文件.md`，则以下命令是等效的：

   ```bash
   # prepare the functions
   # https://unix.stackexchange.com/questions/628842
   base64url::encode () { base64 -w0 | tr '+/' '-_' | tr -d '='; }
   base64url::decode () { awk '{ if (length($0) % 4 == 3) print $0"="; else if (length($0) % 4 == 2) print $0"=="; else print $0; }' | tr -- '-_' '+/' | base64 -d; }

   # pure string encryption then base32
   echo -n 'a-folder-文件夹/a-file-文件.md' | openssl enc -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:mylongpassword | base64url::encode

   # pure string base64url then decryption
   echo -n 'U2FsdGVkX19tNkdFL5rZeHxbe7FL-Pp5mkZJkDNFJWFT6lldZlfa57j0C_cKn0I3PZ9YDvOkyoKqfF6lbn0_yg' | base64url::decode | openssl enc -d -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:mylongpassword
   ```

4. 目录在远程S3上被视为特殊的“0字节”对象。因此，如果某些第三方可以访问远程存储桶，这些元数据信息可能很容易被猜测到。
