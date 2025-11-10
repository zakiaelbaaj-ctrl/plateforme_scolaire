from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Modèle de données pour l'inscription
class SignupData(BaseModel):
    name: str
    email: str
    password: str
    role: str

# Route POST pour l'inscription
@router.post("/api/auth/signup")
def signup(data: SignupData):
    # Ici tu ajouteras la logique pour enregistrer l'utilisateur dans la base
    # Pour le moment, on renvoie juste un message de test
    return {"message": f"Utilisateur {data.name} créé avec succès !"}
