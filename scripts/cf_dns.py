import urllib.request
import json
import os

TOKEN_FILE = "runtime/cloudflare.token"
ZONE_ID = "e2457038a60f5d2c246bca0c70e41d91"

with open(TOKEN_FILE, "r", encoding="utf-8") as f:
    token = f.read().strip()

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

def list_records():
    url = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records"
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        return data.get("result", [])

if __name__ == "__main__":
    records = list_records()
    print(f"Total records in Cloudflare: {len(records)}")
    for r in records:
        print(f"ID: {r['id']} | Type: {r['type']} | Name: {r['name']} | Content: {r['content']} | Proxied: {r['proxied']}")
