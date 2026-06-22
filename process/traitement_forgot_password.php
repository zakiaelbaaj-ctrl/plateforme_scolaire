import os
import sys
import psycopg2
import uuid
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
import smtplib
from email.mime.text import MIMEText

app = Flask(__name__)

# Configuration de la base de données
DB_HOST = 'localhost'
DB_NAME = 'lateforme_scolaire_db'
DB_USER = 'votre_utilisateur'
DB_PASSWORD = 'votre_motdepasse'

# Configuration du serveur SMTP
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
SMTP_USER = 'votre_email@gmail.com'
SMTP_PASSWORD = 'votre_motdepasse_email'

# Fonction pour la connexion à la DB
def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    return conn

# Fonction d'envoi d'email
def send_email(to_email, subject, body):
    msg = MIMEText(body)
    msg['Subject'] = subject
    msg['From'] = SMTP_USER
    msg['To'] = to_email

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)
        server.sendmail(SMTP_USER, [to_email], msg.as_string())
        server.quit()
        print("Email envoyé avec succès")
    except Exception as e:
        print(f"Erreur lors de l'envoi de l'email: {e}")

@app.route('/forgot_password', methods=['POST'])
def forgot_password():
    data = request.get_json()
    email = data.get('email')

    if not email:
        return jsonify({'error': 'Email est requis'}), 400

    # Vérifier si l'email existe dans la base (optionnel, dépend de votre logique)
    # Vous pouvez ajouter cette vérification si nécessaire

    token = str(uuid.uuid4())
    expires_at = datetime.now() + timedelta(hours=1)  # Token valable 1 heure

    # Stocker le token dans la DB
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO password_reset_tokens (email, token, expires_at)
            VALUES (%s, %s, %s)
        """, (email, token, expires_at))
        conn.commit()
    except Exception as e:
        conn.rollback()
        return jsonify({'error': 'Erreur lors de la sauvegarde du token'}), 500
    finally:
        cur.close()
        conn.close()

    # Envoyer l'email avec le lien de réinitialisation
    reset_link = f"http://votre_frontend.com/reset_password?token={token}"
    subject = "Réinitialisation de votre mot de passe"
    body = f"Bonjour,\n\nCliquez sur le lien suivant pour réinitialiser votre mot de passe :\n{reset_link}\n\nCe lien expirera dans 1 heure."
    send_email(email, subject, body)

    return jsonify({'message': 'Un email de réinitialisation a été envoyé si l\'adresse est valide.'}), 200

@app.route('/reset_password', methods=['POST'])
def reset_password():
    data = request.get_json()
    token = data.get('token')
    new_password = data.get('new_password')

    if not token or not new_password:
        return jsonify({'error': 'Token et nouveau mot de passe sont requis'}), 400

    # Vérifier si le token existe et n'est pas expiré
    conn = get_db_connection()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT email, expires_at FROM password_reset_tokens WHERE token = %s
        """, (token,))
        result = cur.fetchone()

        if not result:
            return jsonify({'error': 'Token invalide ou expiré'}), 400

        email, expires_at = result
        if datetime.now() > expires_at:
            return jsonify({'error': 'Token expiré'}), 400

        # Ici, mettez à jour le mot de passe de l'utilisateur dans votre table utilisateur
        # Exemple (supposant une table users avec email et password)
        # cur.execute("UPDATE users SET password = %s WHERE email = %s", (hash_password(new_password), email))
        # Assurez-vous de hasher le mot de passe avant de le sauvegarder

        # Supposons que votre table s'appelle 'users' :
        hashed_password = hash_password(new_password)
        cur.execute("UPDATE users SET password = %s WHERE email = %s", (hashed_password, email))
        conn.commit()

        # Suppression optionnelle du token après utilisation
        cur.execute("DELETE FROM password_reset_tokens WHERE token = %s", (token,))
        conn.commit()

    except Exception as e:
        conn.rollback()
        return jsonify({'error': 'Erreur lors de la réinitialisation du mot de passe'}), 500
    finally:
        cur.close()
        conn.close()

    return jsonify({'message': 'Mot de passe réinitialisé avec succès'}), 200

def hash_password(password):
    import hashlib
    # Utilisez une méthode de hashage plus sûre en production (bcrypt, argon2)
    return hashlib.sha256(password.encode()).hexdigest()

if __name__ == '__main__':
    app.run(debug=True)