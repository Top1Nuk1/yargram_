import os
import paramiko

HOST = "ssh-top1nuk1.alwaysdata.net"
USER = "top1nuk1"
PASS = "#sn.R939$CRwGvV"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)
sftp = client.open_sftp()

def upload_dir(local_dir, remote_dir):
    try:
        sftp.mkdir(remote_dir)
    except IOError:
        pass
    for item in os.listdir(local_dir):
        lpath = os.path.join(local_dir, item)
        rpath = remote_dir + "/" + item
        if os.path.isdir(lpath):
            upload_dir(lpath, rpath)
        else:
            sftp.put(lpath, rpath)
            print(f"Uploaded {item} ({os.path.getsize(lpath)} bytes)")

for folder in ['backdrops', 'banners', 'brand', 'stickers', 'wallpapers']:
    local = f"apps/web/client_out/{folder}"
    remote = f"/home/top1nuk1/yargram/apps/web/client_out/{folder}"
    print(f"\n--- Uploading {folder} ---")
    upload_dir(local, remote)

sftp.close()
client.close()
print("\nAll assets uploaded successfully!")
