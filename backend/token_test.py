# token_test.py
import jwt
from datetime import datetime, timedelta, timezone

# 🔑 Ta clé secrète (à garder confidentielle)
SECRET_KEY = "ZjRx8eVIkDCFCfvGOPanvQbU7YqURKzMYj0OVAuzAH4"

# =========================
# 1️⃣ Générer un token
# =========================
payload = {
    "user_id": 1,
    "email": "test@test.com",
    "role": "eleve",
    "exp": datetime.now(timezone.utc) + timedelta(hours=1)  # expirera dans 1h
}

token = jwt.encode(payload, SECRET_KEY, algorithm="HS256")
print("✅ Nouveau token JWT généré :\n")
print(token)
print("\n")

# =========================
# 2️⃣ Décoder le token
# =========================
try:
    decoded = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    print("✅ Token décodé avec succès :")
    print(decoded)

except jwt.ExpiredSignatureError:
    print("⚠️ Le token a expiré")
except jwt.InvalidTokenError:
    print("⚠️ Token invalide")
