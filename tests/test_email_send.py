# tests/test_email_send.py
import re
import time
from urllib.parse import unquote_plus
from email.message import EmailMessage
import smtplib
import jwt
import pytest

# -------------------------
# Utilitaires pour les tests
# -------------------------

def send_test_email(host: str, port: int, html_body: str, subject: str = "Test local"):
    """
    Envoi simple utilisé pour le test si tu ne veux pas appeler ta fonction réelle.
    Remplace cet appel par l'appel à ta fonction d'envoi réelle si nécessaire.
    """
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = "test@example.com"
    msg["To"] = "destinataire@example.com"
    msg.set_content("Test plain text")
    msg.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(host, port) as s:
        s.send_message(msg)


def extract_html_from_message(message):
    """Retourne la partie HTML décodée d'un email.message.EmailMessage ou None."""
    if message.is_multipart():
        for part in message.walk():
            if part.get_content_type() == "text/html":
                charset = part.get_content_charset() or "utf-8"
                return part.get_payload(decode=True).decode(charset, errors="replace")
    else:
        if message.get_content_type() == "text/html":
            charset = message.get_content_charset() or "utf-8"
            return message.get_payload(decode=True).decode(charset, errors="replace")
    return None


def extract_token_from_html(html: str):
    """
    Extrait la valeur du paramètre token dans une URL contenant reset?token=...
    Retourne None si aucun token trouvé.
    """
    if not html:
        return None
    # Décoder les éventuels encodages d'URL avant la recherche
    html = unquote_plus(html)
    # Cherche reset?token= suivi de caractères valides pour un JWT (base64url + .)
    m = re.search(r"reset\?token=([A-Za-z0-9_\-\.=]+)", html)
    return m.group(1) if m else None


def safe_decode_jwt(token: str):
    """
    Décode un JWT pour inspection sans vérifier la signature.
    - Normalise le type et décodage URL si nécessaire.
    - Vérifie la forme minimale (header.payload.signature).
    - Gère proprement les exceptions PyJWT et renvoie la payload dict.
    """
    if token is None:
        raise ValueError("Token absent")

    # Normaliser bytes -> str et décoder les encodages d'URL
    if isinstance(token, bytes):
        token = token.decode("utf-8", errors="ignore")
    token = unquote_plus(token)

    # Vérification minimale de format
    if token.count(".") != 2:
        raise ValueError("Token JWT invalide : format attendu header.payload.signature")

    # Décodage sans vérification de signature ni d'audience
    try:
        payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
        if not isinstance(payload, dict):
            raise ValueError("Le JWT décodé n'est pas un objet JSON attendu")
        return payload
    except jwt.DecodeError as e:
        raise ValueError(f"Décodage JWT échoué : token mal formé ({e})")
    except jwt.ExpiredSignatureError:
        raise ValueError("Le JWT est expiré")
    except jwt.InvalidTokenError as e:
        raise ValueError(f"Token JWT invalide : {e}")


# -------------------------
# Test principal
# -------------------------

def test_reset_email_contains_token_and_valid_jwt(smtp_debug_server, request):
    """
    Démarre le serveur via la fixture smtp_debug_server (fournie dans tests/conftest.py),
    envoie un mail contenant un token, extrait le token depuis la partie HTML,
    puis décode et vérifie la payload du JWT.

    Comportement :
    - Si une fixture/variable pytest 'jwt_secret' est fournie (ou variable d'environnement),
      le test vérifiera la signature HS256 avec cette clé.
    - Sinon, le test décodera le JWT sans vérification de signature pour inspection.
    """

    host = smtp_debug_server["host"]
    port = smtp_debug_server["port"]
    handler = smtp_debug_server["handler"]

    # -------------------------
    # Option A : générer un token valide localement (exemple)
    # -------------------------
    # Si tu veux tester l'envoi réel de ton application, remplace la génération ci-dessous
    # par l'appel à ta fonction d'envoi (ex: send_reset_email(..., smtp_host=host, smtp_port=port))
    #
    # Génération d'un JWT de test (HS256) pour s'assurer que le token est bien formé.
    jwt_secret = None
    # Essayer de récupérer une fixture nommée 'jwt_secret' si elle existe
    if "jwt_secret" in request.fixturenames:
        jwt_secret = request.getfixturevalue("jwt_secret")

    # Si aucune clé fournie, on crée une clé de test locale (ne pas committer en prod)
    if not jwt_secret:
        jwt_secret = "ma_cle_de_test_locale"  # valeur de secours pour tests locaux uniquement

    payload_for_test = {"user": 123, "exp": int(time.time()) + 3600}
    token = jwt.encode(payload_for_test, jwt_secret, algorithm="HS256")

    # Envoyer l'email contenant le token
    html_body = f'<h1>Reset</h1><p>http://localhost/reset?token={token}</p>'
    send_test_email(host, port, html_body=html_body)

    # -------------------------
    # Attendre la réception
    # -------------------------
    timeout = 5.0
    interval = 0.05
    waited = 0.0
    while waited < timeout and len(handler.messages) == 0:
        time.sleep(interval)
        waited += interval

    assert len(handler.messages) == 1, "Aucun message reçu par le serveur SMTP de debug"

    received = handler.messages[0]

    # Vérifier le sujet si nécessaire
    assert received["Subject"] == "Test local"

    html_part = extract_html_from_message(received)
    assert html_part is not None, "Aucune partie HTML trouvée dans le message"

    extracted_token = extract_token_from_html(html_part)
    assert extracted_token is not None, "Aucun token trouvé dans le HTML (reset?token= absent)"
    assert extracted_token.count(".") == 2, "Le token ne ressemble pas à un JWT (attendu header.payload.signature)"

    # -------------------------
    # Décodage et vérifications
    # -------------------------
    # Si on a une clé (jwt_secret), on peut vérifier la signature HS256.
    # Sinon on décode sans vérification pour inspecter la payload.
    if jwt_secret:
        # Vérifier la signature et la payload avec la clé fournie
        try:
            decoded = jwt.decode(extracted_token, jwt_secret, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            pytest.fail("Le JWT est expiré")
        except jwt.InvalidTokenError as e:
            pytest.fail(f"Échec de la vérification du JWT avec la clé fournie : {e}")

        # Assertions sur les claims attendus
        assert decoded.get("user") == 123
        assert "exp" in decoded
    else:
        # Décodage sans vérification (inspection)
        payload_decoded = safe_decode_jwt(extracted_token)
        assert payload_decoded.get("user") == 123
        assert "exp" in payload_decoded
