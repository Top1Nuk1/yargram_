import urllib.request
import json

TOKEN_FILE = "runtime/cloudflare.token"
ZONE_ID = "e2457038a60f5d2c246bca0c70e41d91"

with open(TOKEN_FILE, "r", encoding="utf-8") as f:
    token = f.read().strip()

headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def api_call(url, data=None, method="GET"):
    req = urllib.request.Request(url, headers=headers, method=method)
    if data:
        req.data = json.dumps(data).encode("utf-8")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

records = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records").get("result", [])
for r in records:
    if r["name"] == "yargram.site":
        api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records/{r['id']}", method="DELETE")
        print(f"Deleted old {r['type']} record for yargram.site")

res = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records", data={
    "type": "A",
    "name": "yargram.site",
    "content": "185.31.40.24",
    "proxied": True,
    "ttl": 1
}, method="POST")
print("Added A record for yargram.site -> 185.31.40.24 (proxied: True):", res.get("success"))
