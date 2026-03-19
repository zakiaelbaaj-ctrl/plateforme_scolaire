# -*- coding: utf-8 -*-
import sys
import os

# Forcer Windows à utiliser UTF-8
if sys.platform == 'win32':
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

"""
Application Flask - Plateforme Scolaire
Gestion des utilisateurs, authentification et reinitialisation de mot de passe
"""

# Forcer l'encodage UTF-8 partout
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

import os
os.environ['PYTHONIOENCODING'] = 'utf-8'
import uuid
import smtplib
import jwt
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from urllib.parse import urlparse, quote_plus

from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash

# ========== CHARGER LE FICHIER .env ==========
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path)

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY", "change_me_secret_key_in_production")

if not DATABASE_URL:
    raise RuntimeError("ERREUR: DATABASE_URL manquant dans le fichier .env")

print("OK: .env charge correctement")

# ========== ENCODER LA DATABASE URL POSTGRESQL ==========

# Parser l'URL
parsed = urlparse(DATABASE_URL)

# Encoder le mot de passe pour ignorer les caractères spéciaux
password_encoded = quote_plus(parsed.password) if parsed.password else ""
# Construire la partie port uniquement si elle existe
netloc = parsed.hostname
if parsed.port:
    netloc += f":{parsed.port}"

# Recomposer l'URL pour SQLAlchemy
DATABASE_URL_SAFE = f"postgresql://{parsed.username}:{password_encoded}@{netloc}{parsed.path}"


# Affichage pour vérification
print("\n===== Vérification DATABASE_URL =====")
print("URL originale       :", DATABASE_URL)
print("Mot de passe encodé  :", password_encoded)
print("URL encodée SQLAlchemy :", DATABASE_URL_SAFE)
print("====================================\n")
# ========== CREER L'APPLICATION FLASK ==========
app = Flask(__name__)
app.config['SECRET_KEY'] = SECRET_KEY

# Configuration Email
app.config['MAIL_SENDER'] = os.getenv('MAIL_SENDER', 'zakiaelbaaj@gmail.com')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD', '')
app.config['FRONTEND_URL'] = os.getenv('FRONTEND_URL', 'http://127.0.0.1:8000')

# Configuration Database
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL_SAFE
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
    "echo": False,
    "pool_pre_ping": True,
    "pool_recycle": 3600,
}

# Configuration CORS
CORS(app, supports_credentials=True, resources={
    r"/api/*": {
        "origins": ["http://127.0.0.1:8000", "http://localhost:8000"],
        "methods": ["GET", "POST", "PUT", "DELETE"],
        "allow_headers": ["Content-Type", "Authorization"]
    }
})

# Initialiser les extensions
db = SQLAlchemy(app)
migrate = Migrate(app, db)

# ========== MODELES ==========

class User(db.Model):
    """Modele utilisateur"""
    __tablename__ = "user"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # eleve, professeur, admin
    verified = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))


class Profile(db.Model):
    """Modele profil utilisateur"""
    __tablename__ = 'profile'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('user.id', ondelete='CASCADE'),
        nullable=False
    )
    bio = db.Column(db.Text)
    subjects = db.Column(db.String(200))
    levels = db.Column(db.String(100))
    hourly_rate = db.Column(db.Float, default=15.00)
    average_rating = db.Column(db.Float, default=0.0)
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    user = db.relationship('User', backref=db.backref('profile', uselist=False))


class PasswordResetToken(db.Model):
    """Modele token de reinitialisation de mot de passe"""
    __tablename__ = 'password_reset_token'

    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(255), unique=True, nullable=False)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey('user.id', ondelete='CASCADE'),
        nullable=False
    )
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    user = db.relationship(
        'User',
        backref=db.backref('reset_tokens', lazy=True)
    )


class EmailVerificationToken(db.Model):
    """Modele token de verification d'email"""
    __tablename__ = "email_verification_token"

    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(255), unique=True, nullable=False)
    user_id = db.Column(
        db.Integer,
        db.ForeignKey("user.id", ondelete='CASCADE'),
        nullable=False
    )
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc)
    )

    user = db.relationship(
        'User',
        backref=db.backref('email_tokens', lazy=True)
    )

# ========== FONCTIONS UTILITAIRES ==========

def generate_jwt(user):
    """Generer un JWT pour l'utilisateur"""
    payload = {
        "user_id": user.id,
        "email": user.email,
        "role": user.role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=24)
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm="HS256")


def validate_password_strength(password):
    """Valider la force du mot de passe"""
    if len(password) < 8:
        return False, "Le mot de passe doit contenir au moins 8 caracteres"
    
    has_lower = any(c.islower() for c in password)
    has_upper = any(c.isupper() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(not c.isalnum() for c in password)
    
    strength = sum([has_lower, has_upper, has_digit, has_special])
    
    if strength < 3:
        return False, "Le mot de passe doit contenir majuscules, minuscules, chiffres et caracteres speciaux"
    
    return True, "OK"


def send_email(to_email, subject, html_content):
    """Envoyer un email"""
    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = app.config["MAIL_SENDER"]
        msg["To"] = to_email
        msg["Subject"] = subject

        msg.attach(MIMEText(html_content, "html"))

        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(app.config["MAIL_SENDER"], app.config["MAIL_PASSWORD"])
            server.send_message(msg)
        
        return True
    except Exception as e:
        print(f"ERREUR ENVOI EMAIL: {e}")
        return False

# ========== ROUTES AUTHENTIFICATION ==========

@app.route("/api/auth/register", methods=["POST"])
def register():
    """Inscrire un nouvel utilisateur"""
    try:
        data = request.json

        # Validation des donnees
        if not all([data.get("email"), data.get("password"), data.get("name"), data.get("role")]):
            return jsonify({"message": "Donnees manquantes"}), 400

        # Verifier si l'email existe deja
        if User.query.filter_by(email=data["email"]).first():
            return jsonify({"message": "Email deja utilise"}), 409

        # Valider la force du mot de passe
        is_valid, msg = validate_password_strength(data["password"])
        if not is_valid:
            return jsonify({"message": msg}), 400

        # Creer l'utilisateur
        hashed_pw = generate_password_hash(data["password"])
        new_user = User(
            name=data["name"],
            email=data["email"],
            password=hashed_pw,
            role=data["role"],
            verified=False
        )

        db.session.add(new_user)
        db.session.commit()

        return jsonify({
            "message": "Utilisateur inscrit avec succes",
            "user_id": new_user.id
        }), 201

    except Exception as e:
        db.session.rollback()
        print(f"ERREUR INSCRIPTION: {e}")
        return jsonify({"message": "Erreur d'inscription"}), 500


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Connecter un utilisateur"""
    try:
        data = request.json

        if not data.get("email") or not data.get("password"):
            return jsonify({"message": "Email et mot de passe requis"}), 400

        user = User.query.filter_by(email=data["email"]).first()

        if not user or not check_password_hash(user.password, data["password"]):
            return jsonify({"message": "Email ou mot de passe incorrect"}), 401

        token = generate_jwt(user)

        return jsonify({
            "message": "Connexion reussie",
            "token": token,
            "user": {
                "id": user.id,
                "email": user.email,
                "name": user.name,
                "role": user.role
            }
        }), 200

    except Exception as e:
        print(f"ERREUR CONNEXION: {e}")
        return jsonify({"message": "Erreur de connexion"}), 500


@app.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    """Demander un lien de reinitialisation de mot de passe"""
    try:
        data = request.json
        email = data.get("email")

        if not email:
            return jsonify({"message": "Email requis"}), 400

        user = User.query.filter_by(email=email).first()

        # Ne pas reveler si l'email existe (securite)
        if not user:
            return jsonify({"message": "Si cet email existe, un lien a ete envoye"}), 200

        # Supprimer les anciens tokens
        PasswordResetToken.query.filter_by(user_id=user.id).delete()
        db.session.commit()

        # Generer un nouveau token
        token = str(uuid.uuid4())
        expires_at = datetime.now(timezone.utc) + timedelta(hours=1)

        reset_token = PasswordResetToken(
            token=token,
            user_id=user.id,
            expires_at=expires_at
        )

        db.session.add(reset_token)
        db.session.commit()

        # Construire le lien
        reset_link = f"{app.config['FRONTEND_URL']}/reset_password.html?token={token}"

        # Construire le HTML de l'email
        html_content = f"""
        <html>
            <body style="font-family: Arial, sans-serif;">
                <h2>Reinitialisation du mot de passe</h2>
                <p>Bonjour,</p>
                <p>Vous avez demande la reinitialisation de votre mot de passe.</p>
                <p><a href="{reset_link}" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Reinitialiser le mot de passe</a></p>
                <p>Ce lien expire dans 1 heure.</p>
                <p>Si vous n'avez pas fait cette demande, ignorez cet email.</p>
            </body>
        </html>
        """

        # Envoyer l'email
        if send_email(user.email, "Reinitialisation de votre mot de passe", html_content):
            return jsonify({"message": "Lien de reinitialisation envoye"}), 200
        else:
            return jsonify({"message": "Erreur d'envoi d'email"}), 500

    except Exception as e:
        db.session.rollback()
        print(f"ERREUR FORGOT PASSWORD: {e}")
        return jsonify({"message": "Erreur"}), 500


@app.route("/api/auth/verify-token/<token>", methods=["GET"])
def verify_token(token):
    """Verifier si le token est valide et non expire"""
    try:
        token_obj = PasswordResetToken.query.filter_by(token=token).first()

        if not token_obj:
            return jsonify({"message": "Token invalide"}), 400

        if token_obj.expires_at < datetime.now(timezone.utc):
            db.session.delete(token_obj)
            db.session.commit()
            return jsonify({"message": "Token expire"}), 400

        return jsonify({"message": "Token valide"}), 200

    except Exception as e:
        print(f"ERREUR VERIFICATION TOKEN: {e}")
        return jsonify({"message": "Erreur de verification"}), 500


@app.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    """Reinitialiser le mot de passe avec le token"""
    try:
        data = request.json
        token = data.get("token")
        password = data.get("password")

        if not token or not password:
            return jsonify({"message": "Token et mot de passe requis"}), 400

        # Valider la force du mot de passe
        is_valid, msg = validate_password_strength(password)
        if not is_valid:
            return jsonify({"message": msg}), 400

        token_obj = PasswordResetToken.query.filter_by(token=token).first()

        if not token_obj:
            return jsonify({"message": "Token invalide"}), 400

        if token_obj.expires_at < datetime.now(timezone.utc):
            db.session.delete(token_obj)
            db.session.commit()
            return jsonify({"message": "Token expire"}), 400

        user = User.query.get(token_obj.user_id)
        if not user:
            return jsonify({"message": "Utilisateur introuvable"}), 404

        # Mettre a jour le mot de passe
        user.password = generate_password_hash(password)
        db.session.delete(token_obj)
        db.session.commit()

        return jsonify({"message": "Mot de passe reinitialise avec succes"}), 200

    except Exception as e:
        db.session.rollback()
        print(f"ERREUR RESET PASSWORD: {e}")
        return jsonify({"message": "Erreur de reinitialisation"}), 500


@app.route("/api/auth/profiles", methods=["POST"])
def create_profile():
    """Creer un profil utilisateur"""
    try:
        data = request.json

        if not data.get("user_id"):
            return jsonify({"message": "user_id requis"}), 400

        user = User.query.get(data["user_id"])
        if not user:
            return jsonify({"message": "Utilisateur introuvable"}), 404

        new_profile = Profile(
            user_id=data["user_id"],
            bio=data.get("bio", ""),
            subjects=data.get("subjects", ""),
            levels=data.get("levels", "")
        )

        db.session.add(new_profile)
        db.session.commit()

        return jsonify({"message": "Profil cree avec succes"}), 201

    except Exception as e:
        db.session.rollback()
        print(f"ERREUR PROFIL: {e}")
        return jsonify({"message": "Erreur de creation de profil"}), 500


# ========== ROUTES PAGE HTML ==========

@app.route("/reset_password_page")
def reset_password_page():
    """Servir la page de reinitialisation"""
    return render_template("reset_password.html")


# ========== GESTION DES ERREURS ==========

@app.errorhandler(404)
def not_found(error):
    return jsonify({"message": "Route non trouvee"}), 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({"message": "Erreur serveur"}), 500


# ========== LANCEMENT ==========

if __name__ == "__main__":
    print("\nDemarrage du serveur Flask sur http://127.0.0.1:5000")
    print("Les tables seront creees via Flask-Migrate\n")
    app.run(debug=True, host="127.0.0.1", port=5000)