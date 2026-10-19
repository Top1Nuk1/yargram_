import os
import paramiko

HOST = "ssh-top1nuk1.alwaysdata.net"
USER = "top1nuk1"
PASS = "#sn.R939$CRwGvV"

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=20)
sftp = client.open_sftp()

remote_uploads = "/home/top1nuk1/yargram/apps/server/data/uploads"
try:
    sftp.mkdir(remote_uploads)
except IOError:
    pass

local_uploads = "apps/server/data/uploads"
files = os.listdir(local_uploads)
print(f"Total files in local uploads: {len(files)}")

# Exclude big executable files to avoid filling 100 MB quota
uploaded_count = 0
for f in files:
    if f.endswith(".exe"):
        print(f"Skipping large exe: {f}")
        continue
    lpath = os.path.join(local_uploads, f)
    rpath = remote_uploads + "/" + f
    sftp.put(lpath, rpath)
    uploaded_count += 1
    print(f"Uploaded {f} ({os.path.getsize(lpath)} bytes)")

sftp.close()
client.close()
print(f"\nUploaded {uploaded_count} files to {remote_uploads} successfully!")
