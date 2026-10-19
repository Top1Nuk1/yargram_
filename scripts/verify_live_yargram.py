import urllib.request
import re

print("=== 1. Checking /health ===")
with urllib.request.urlopen("https://top1nuk1.alwaysdata.net/health") as resp:
    print("Health:", resp.read().decode("utf-8"))

print("\n=== 2. Checking / (Landing) ===")
with urllib.request.urlopen("https://top1nuk1.alwaysdata.net/") as resp:
    html = resp.read().decode("utf-8")
    print(f"Landing loaded ({len(html)} bytes)")

print("\n=== 3. Checking /app (Web Messenger) ===")
with urllib.request.urlopen("https://top1nuk1.alwaysdata.net/app") as resp:
    html = resp.read().decode("utf-8")
    print(f"Web Messenger loaded ({len(html)} bytes)")
    scripts = re.findall(r'src=["\']([^"\']+)["\']', html)
    print("Detected scripts:", scripts)
    for s in scripts:
        full_url = "https://top1nuk1.alwaysdata.net" + (s if s.startswith("/") else "/app/" + s)
        try:
            with urllib.request.urlopen(full_url) as s_resp:
                print(f"  OK {full_url} ({len(s_resp.read())} bytes)")
        except Exception as e:
            print(f"  FAIL {full_url}: {e}")

print("\n=== 4. Checking Socket.IO realtime handshake ===")
try:
    with urllib.request.urlopen("https://top1nuk1.alwaysdata.net/socket.io/?EIO=4&transport=polling") as resp:
        body = resp.read().decode("utf-8")
        print(f"Socket.IO handshake OK: {body[:80]}...")
except Exception as e:
    print("Socket.IO failed:", e)

print("\n=== 5. Testing user registration API ===")
import json
req_data = json.dumps({
    "email": "test_bot_runner@yargram.net",
    "password": "Password12345!",
    "displayName": "Test Bot",
    "username": "testbotrunner"
}).encode("utf-8")

try:
    req = urllib.request.Request(
        "https://top1nuk1.alwaysdata.net/api/auth/register",
        data=req_data,
        headers={"Content-Type": "application/json", "User-Agent": "YarGramTest/1.0"}
    )
    with urllib.request.urlopen(req) as resp:
        print("Registration response:", resp.status, resp.read().decode("utf-8")[:150])
except urllib.error.HTTPError as e:
    print("Registration HTTP response:", e.code, e.read().decode("utf-8"))
except Exception as e:
    print("Registration error:", e)
