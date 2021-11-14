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

3. The file/directory path strings, are encrypted using openssl in binary mode and then `base32` is applied.
   Assuming the file path is `a-folder-文件夹/a-file-文件.md`, then the following commands are equivilent:

   ```bash
   # pure string encryption then base32
   echo -n 'a-folder-文件夹/a-file-文件.md' | openssl enc -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:mylongpassword | base32 -w 0

   # pure string base32 then decryption
   echo -n 'KNQWY5DFMRPV7UHRWVYFSHE2XVVVZCFN65SR7ETEKO5L6EYGXCVEPT4A2LVTW4W2ZHXWF3K22SVA562CCZ6SALARXJY6AAXXHLK5UOA=' | base32 -d -w 00 | openssl enc -d -aes-256-cbc -pbkdf2 -iter 20000 -pass pass:mylongpassword
   ```

4. The directory is considered as special "0-byte" object on remote s3. So this meta infomation may be easily guessed if some third party can access the remote bucket.
