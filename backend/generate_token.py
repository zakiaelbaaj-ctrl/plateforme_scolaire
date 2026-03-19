# generate_token.py

import os
import jwt
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

# Charger .env
load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY manquant dans .env")

def generate_test_token(user_id=1, email="test@test.com", role="eleve"):
    payload = {
        "user_id": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1)
    }

    token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
    return token

if __name__ == "__main__":
    token = generate_test_token()
    print("\nTOKEN JWT GÉNÉRÉ :\n")
    print(token)
