import json

for path in ['apps/server/data/yargram.json', 'runtime/yargram-from-backup.json']:
    try:
        with open(path, 'r', encoding='utf-8') as f:
            d = json.load(f)
            users = d.get('users', [])
            msgs = d.get('messages', [])
            convs = d.get('conversations', [])
            print(f"=== {path} ===")
            print(f"Users: {len(users)}, Messages: {len(msgs)}, Conversations: {len(convs)}")
            for u in users[:10]:
                print(f"  User: {u.get('displayName')} | email: {u.get('email')} | username: {u.get('username')}")
    except Exception as e:
        print(f"{path} error: {e}")
