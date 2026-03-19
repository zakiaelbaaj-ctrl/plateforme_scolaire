// ws/chat/init.js
// Initialiseur minimal pour le domaine "chat" des WebSockets.
// Écoute les messages ws:message et répond à un ping de test.

export default function initChatWS(wss, deps = {}) {
  wss.on("ws:message", (ws, msg) => {
    try {
      if (!msg || !msg.type) return;

      // Réponse de test
      if (msg.type === "pingChat") {
        ws.send(JSON.stringify({ type: "pongChat", ok: true }));
        return;
      }

      // Exemple : broadcast simple (à adapter selon ton architecture)
      if (msg.type === "chat:message" && typeof msg.payload === "object") {
        const out = JSON.stringify({ type: "chat:message", payload: msg.payload });
        // broadcast à tous les sockets si wss.clients est disponible
        if (wss.clients && typeof wss.clients.forEach === "function") {
          wss.clients.forEach(client => {
            try { client.send(out); } catch (e) { /* ignore */ }
          });
        } else {
          // fallback : répondre au socket émetteur
          ws.send(out);
        }
        return;
      }

      // autres types ignorés ici
    } catch (err) {
      console.error("chat WS error:", err);
      try { ws.send(JSON.stringify({ type: "error", message: "Erreur interne chat" })); } catch(e){}
    }
  });

  return { name: "chat", initialized: true };
}
