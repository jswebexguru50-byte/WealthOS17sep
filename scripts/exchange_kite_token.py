import requests
import hashlib
import sqlite3
import json
from pathlib import Path

token = 'NXV4J53Y3nTsqdEq3QMsQ6DWPGl5YKnO'
api_key = 'm8wqr277nffl4sx1'
api_secret = '7fpyz17fh7sqt05x4xvhw3wbc2x8kvaa'

checksum = hashlib.sha256(f"{api_key}{token}{api_secret}".encode()).hexdigest()
resp = requests.post('https://api.kite.trade/session/token', data={
    'api_key': api_key,
    'request_token': token,
    'checksum': checksum
})

print(f"Status: {resp.status_code}")
if resp.status_code == 200:
    data = resp.json()['data']
    access_token = data['access_token']
    user_name = data.get('user_name')
    user_id = data.get('user_id')
    print(f"Successfully exchanged request token!")
    print(f"Authenticated as: {user_name} ({user_id})")
    print(f"New Access Token: {access_token}")
    
    ROOT = Path("c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release").resolve()
    with sqlite3.connect(ROOT / 'portfolio.db') as db:
        db.execute("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token', ?)", (access_token,))
        db.execute("INSERT OR REPLACE INTO AppConfig (key, value) VALUES ('Kite_Access_Token_Updated_At', datetime('now'))")
        db.commit()
    print("Saved access token to portfolio.db AppConfig.")

    # Also update .env
    env_path = ROOT / '.env'
    if env_path.exists():
        content = env_path.read_text(encoding='utf-8')
        lines = []
        token_replaced = False
        for line in content.splitlines():
            if line.startswith('KITE_ACCESS_TOKEN='):
                lines.append(f"KITE_ACCESS_TOKEN={access_token}")
                token_replaced = True
            else:
                lines.append(line)
        if not token_replaced:
            lines.append(f"KITE_ACCESS_TOKEN={access_token}")
        env_path.write_text('\n'.join(lines) + '\n', encoding='utf-8')
        print("Updated KITE_ACCESS_TOKEN in .env.")
else:
    # If already exchanged in the previous curl/python test, read it from portfolio.db or check error
    print("Exchange response:", resp.text)
