# Encryption

If a password is set, the files are encrypted before being sent to the cloud.

The encryption algorithm is delibrately designed to be aligned with openssl format.

1. The encryption algorithm is implemented using web-crypto.
2. The file content is encrypted using openssl format. Assuming a file named `sometext.txt`, a password `somepassword`, then the encryption is equivalent to the following command:

   ```bash
   # file content encryption (ignoring file path encryption)
   openssl enc -p -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:somepassword -in ./sometext.txt -out ./sometext.txt.enc

   # file content decryption (ignoring file path decryption)
   openssl enc -d -p -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:somepassword -in ./sometext.txt.enc -out ./sometext.txt
   ```

3. The file/directory path strings, are encrypted using openssl in binary mode and then `base64url without padding` is applied.
   Assuming the file path is `a-folder-文件夹/a-file-文件.md`, then the following commands are equivilent:

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

4. The directory is considered as special "0-byte" object on remote s3. So this meta infomation may be easily guessed if some third party can access the remote bucket.
