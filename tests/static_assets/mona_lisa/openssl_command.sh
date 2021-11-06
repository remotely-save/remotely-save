# The encryption file is produced by the following command.
# A salt is explictly provided because we need reproducible output in tests.
openssl enc -p -aes-256-cbc -S 8302F586FAB491EC -pbkdf2 -iter 10000 -pass pass:somepassword -in '1374px-Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg' -out 1374px-Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg.enc
