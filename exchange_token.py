import requests
import hashlib
import sqlite3
from pathlib import Path

ROOT = Path("c:/Users/gopal/OneDrive/Desktop/tesr/webapp_portable_release").resolve()

def exchange_token(request_token):
    api_key = "m8wqr277nffl4sx1"
    api_secret = "7fpyz17fh7sqt05x4xvhw3wbc2x8kvaa"
    
    checksum = hashlib.sha256((api_key + request_token + api_secret).encode('utf-8')).hexdigest()
    
    resp = requests.post(
        "https://api.kite.trade/session/token",
        data={
            "api_key": api_key,
            "request_token": request_token,
            "checksum": checksum
        }
    )
    
    if resp.status_code == 200:
        data = resp.json()
        access_token = data["data"]["access_token"]
        print(f"Obtained Access Token: {access_token}")
        
        # Save to DB
        with sqlite3.connect(f"{ROOT}/portfolio.db") as db:
            db.execute("UPDATE AppConfig SET value = ? WHERE key = 'Kite_Access_Token'", (access_token,))
            db.commit()
        print("Updated portfolio.db successfully.")
        return True
    else:
        print(f"Error generating session: {resp.status_code} {resp.text}")
        return False

if __name__ == '__main__':
    request_token = "MJ4t6YE1DfIoNtUedZR7ZauUN4km0MXd"
    exchange_token(request_token)
