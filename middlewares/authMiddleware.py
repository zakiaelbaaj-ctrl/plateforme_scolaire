# middleware/authMiddleware.py
from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
from dotenv import load_dotenv

load_dotenv()

# Utilisation de HTTPBearer pour extraire le token de l'en-tête Authorization
class JWTBearer(HTTPBearer):
    def __init__(self, auto_error: bool = True):
        super(JWTBearer, self).__init__(auto_error=auto_error)

    async def __call__(self, request: Request):
        credentials: HTTPAuthorizationCredentials = await super(JWTBearer, self).__call__(request)
        if credentials:
            if not credentials.scheme == "Bearer":
                raise HTTPException(status_code=403, detail="Schéma d'authentification invalide")
            if not self.verify_jwt(credentials.credentials):
                raise HTTPException(status_code=403, detail="Token invalide ou expiré")
            return credentials.credentials
        else:
            raise HTTPException(status_code=401, detail="Token manquant")

    def verify_jwt(self, token: str) -> bool:
        try:
            payload = jwt.decode(token, os.getenv("JWT_SECRET"), algorithms=["HS256"])
            return True
        except jwt.ExpiredSignatureError:
            return False
        except jwt.InvalidTokenError:
            return False
