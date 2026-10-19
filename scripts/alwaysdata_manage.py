import sys
import os
import paramiko

HOST = "ssh-top1nuk1.alwaysdata.net"
USER = "top1nuk1"
# Read password from askpass.bat or define here
PASS = "#sn.R939$CRwGvV"

import socket

def get_client():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('192.168.0.12', 0))
        s.connect((HOST, 22))
        client.connect(HOST, username=USER, password=PASS, sock=s, timeout=20)
    except Exception:
        client.connect(HOST, username=USER, password=PASS, timeout=20)
    return client

def run_cmd(cmd):
    client = get_client()
    print(f">>> Running: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    print("STDOUT:\n" + out)
    if err:
        print("STDERR:\n" + err)
    client.close()
    return out, err

def get_sftp():
    client = get_client()
    return client, client.open_sftp()

def upload_file(local_path, remote_path):
    client, sftp = get_sftp()
    print(f">>> Uploading {local_path} -> {remote_path}")
    sftp.put(local_path, remote_path)
    sftp.close()
    client.close()
    print(">>> Upload complete")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        if sys.argv[1] == "upload" and len(sys.argv) == 4:
            upload_file(sys.argv[2], sys.argv[3])
        else:
            run_cmd(" ".join(sys.argv[1:]))
    else:
        run_cmd("echo ALWAYS_CONNECTED && uname -a && ls -la ~/yargram")

