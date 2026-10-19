import urllib.request
import json

TOKEN_FILE = "runtime/cloudflare.token"
ZONE_ID = "e2457038a60f5d2c246bca0c70e41d91"
ALWAYSDATA_IP = "185.31.40.24"
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

def get_records():
    res = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records")
    return res.get("result", [])

def delete_record(rec_id):
    print(f"Deleting record {rec_id}...")
    res = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records/{rec_id}", method="DELETE")
    print("Delete result:", res.get("success"))

def add_record(rec_type, name, content, proxied=False):
    print(f"Adding record {rec_type} {name} -> {content} (proxied={proxied})...")
    data = {
        "type": rec_type,
        "name": name,
        "content": content,
        "ttl": 1, # Auto TTL
        "proxied": proxied
    }
    res = api_call(f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/dns_records", data=data, method="POST")
    print("Add result:", res.get("success"))

def setup_alwaysdata_dns():
    existing = get_records()
    for r in existing:
        if r["name"] in ["yargram.site", "www.yargram.site"]:
            delete_record(r["id"])
    
    # Add A record for root domain yargram.site -> Alwaysdata IP
    add_record("A", "yargram.site", ALWAYSDATA_IP, proxied=False)
    # Add CNAME for www.yargram.site -> top1nuk1.alwaysdata.net
    add_record("CNAME", "www.yargram.site", ALWAYSDATA_HOST, proxied=False)
    
    print("\nUpdated Cloudflare DNS:")
    for r in get_records():
        print(f"  {r['type']} {r['name']} -> {r['content']} (proxied: {r['proxied']})")

if __name__ == "__main__":
    setup_alwaysdata_dns()
