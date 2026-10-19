import os
import socket
import paramiko

HOST = "ssh-top1nuk1.alwaysdata.net"
USER = "top1nuk1"
PASS = "#sn.R939$CRwGvV"

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.bind(('192.168.0.12', 0))
s.connect((HOST, 22))

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, sock=s, timeout=30)
sftp = client.open_sftp()

remote_uploads = "/home/top1nuk1/yargram/apps/server/data/uploads"
existing = set(sftp.listdir(remote_uploads))
print(f"Already on remote: {len(existing)} files")

local_uploads = "apps/server/data/uploads"
missing = []
for f in os.listdir(local_uploads):
    if f.endswith(".exe"):
        continue
    if f not in existing:
        missing.append(f)

print(f"Missing on remote: {len(missing)} files: {missing}")

for f in missing:
    lpath = os.path.join(local_uploads, f)
    rpath = remote_uploads + "/" + f
    sz = os.path.getsize(lpath)
    print(f"Uploading {f} ({sz} bytes)...")
    sftp.put(lpath, rpath)
    print("Done.")

sftp.close()
client.close()
print("All missing files uploaded successfully!")
