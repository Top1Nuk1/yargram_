import sys
import json
import urllib.request

ZONE_ID = "e2457038a60f5d2c246bca0c70e41d91"
DEFAULT_EMAIL = "Topnuk76@gmail.com"

def get_headers(auth_val, email=None):
    if email:
        return {
            "X-Auth-Email": email,
            "X-Auth-Key": auth_val,
            "Content-Type": "application/json"
        }
    return {
        "Authorization": f"Bearer {auth_val}",
        "Content-Type": "application/json"
    }

def update_setting(setting_id, value, headers):
    url = f"https://api.cloudflare.com/client/v4/zones/{ZONE_ID}/settings/{setting_id}"
    data = json.dumps({"value": value}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as resp:
            res = json.loads(resp.read().decode())
            print(f"  [OK] {setting_id} -> {value}: {res.get('success')}")
            return True
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"  [FAIL] {setting_id} -> {value}: HTTP {e.code} - {err_body}")
        return False
    except Exception as e:
        print(f"  [ERROR] {setting_id}: {e}")
        return False

def apply_all(auth_val, email=None):
    headers = get_headers(auth_val, email)
    print("\n--- Applying anti-censorship settings for yargram.site ---")
    settings = [
        ("ech", "off"),
        ("ipv6", "off"),
        ("http3", "off"),
        ("ssl", "flexible"),
        ("websockets", "on"),
        ("always_use_https", "on"),
        ("min_tls_version", "1.2"),
        ("tls_1_3", "on")
    ]
    all_ok = True
    for sid, val in settings:
        ok = update_setting(sid, val, headers)
        if not ok:
            all_ok = False
    return all_ok

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python apply_cf_settings.py <API_TOKEN_OR_GLOBAL_KEY> [EMAIL]")
        sys.exit(1)
    
    key = sys.argv[1].strip()
    email = sys.argv[2].strip() if len(sys.argv) > 2 else (DEFAULT_EMAIL if len(key) == 37 else None)
    success = apply_all(key, email)
    if success:
        print("\nAll optimal settings successfully applied! yargram.site is ready for mobile networks in RF.")
    else:
        print("\nSome settings could not be applied. Check permissions.")
