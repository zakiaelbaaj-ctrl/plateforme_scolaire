import jwt
from datetime import datetime

# Token JWT complet
token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJyb2xlIjoiZWxldmUiLCJleHAiOjE3NjYwMDYxMjh9.ZVJQgIfUexiUX47SU9c8kOmg6tmeWRL7aK14qD_2aSQ"

# Clé secrète utilisée pour générer le token
SECRET_KEY = "ZjRx8eVIkDCFCfvGOPanvQbU7YqURKzMYj0OVAuzAH4"

try:
    decoded = jwt.decode(token, SECRET_KEY, algorithms=["HS256"], options={"verify_exp": False})
    print("Token décodé (expiration ignorée) :")
    print(decoded)
except jwt.InvalidTokenError:
    print("⚠️ Token invalide")