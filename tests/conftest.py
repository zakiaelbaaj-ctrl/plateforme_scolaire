# tests/conftest.py
import socket
import time
import os
import pytest
from aiosmtpd.controller import Controller
from aiosmtpd.handlers import AsyncMessage

class MemoryHandler(AsyncMessage):
    """Handler asynchrone qui stocke les messages reçus en mémoire."""
    def __init__(self):
        super().__init__()
        self.messages = []

    async def handle_message(self, message):
        # message est un email.message.EmailMessage
        self.messages.append(message)
        return "250 Message accepted for delivery"

def find_free_port():
    """Trouve un port libre sur localhost."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    _, port = s.getsockname()
    s.close()
    return port

@pytest.fixture(scope="function")
def smtp_debug_server():
    """
    Démarre un serveur SMTP (aiosmtpd) sur un port libre.
    Rend un dict: host, port, handler, controller.
    """
    port = find_free_port()
    handler = MemoryHandler()
    controller = Controller(handler, hostname="127.0.0.1", port=port)
    controller.start()
    # petit délai pour s'assurer que le serveur écoute
    time.sleep(0.05)
    try:
        yield {"host": "127.0.0.1", "port": port, "handler": handler, "controller": controller}
    finally:
        controller.stop()

@pytest.fixture(scope="session")
def jwt_secret():
    """
    Fixture qui fournit la clé JWT pour les tests.
    Priorité: variable d'environnement APP_JWT_SECRET, sinon valeur de secours locale.
    Ne pas committer une vraie clé de production.
    """
    secret = os.environ.get("APP_JWT_SECRET")
    if not secret:
        secret = "ma_cle_de_test_locale"
    return secret
