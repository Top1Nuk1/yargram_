import urllib.request
import json

TOKEN_FILE = "runtime/cloudflare.token"
ZONE_ID = "e2457038a60f5d2c246bca0c70e41d91"
ALWAYSDATA_HOST = "top1nuk1.alwaysdata.net"

with open(TOKEN_FILE, "r", encoding="utf-8") as f:
    token = f.read().strip()

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

def api_call(url, data=None, method="GET"):
    req = urllib.request.Request(url, headers=headers, method=method)
    if data:
        req.data = json.dumps(data).encode("utf-8")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode())

records = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records").get("result", [])
for r in records:
    if r["name"] in ["yargram.site", "www.yargram.site"]:
        rec_id = r["id"]
        del_res = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records/{rec_id}", method="DELETE")
        print(f"Deleted {r['name']}: {del_res.get('success')}")

res1 = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records", data={
    "type": "CNAME", "name": "yargram.site", "content": ALWAYSDATA_HOST, "proxied": True, "ttl": 1
}, method="POST")
print("Added yargram.site CNAME (proxied=True):", res1.get("success"))

res2 = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records", data={
    "type": "CNAME", "name": "www.yargram.site", "content": ALWAYSDATA_HOST, "proxied": True, "ttl": 1
}, method="POST")
print("Added www.yargram.site CNAME (proxied=True):", res2.get("success"))
