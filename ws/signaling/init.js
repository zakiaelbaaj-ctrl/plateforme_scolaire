// ws/signaling/init.js
// Initialiseur minimal pour le module signaling (WebRTC signaling / échange d'offers/answers/ICE).
// À remplacer ensuite par ta logique réelle de signaling.

export default function initSignalingWS(wss, deps = {}) {
  // Écouteur générique d'exemple : on suppose que wss émet un événement 'ws:message'
  // ou que tu appelles explicitement les handlers depuis ton code principal.
  if (wss && typeof wss.on === "function") {
    wss.on("ws:message", (ws, msg) => {
      try {
        if (!msg || !msg.type) return;

        // Ping de test
        if (msg.type === "pingSignaling") {
          ws.send(JSON.stringify({ type: "pongSignaling", ok: true }));
          return;
        }

        // Exemple simple de routage pour signaling (offer/answer/ice)
        if (msg.type === "signaling:signal" && msg.payload) {
          const out = JSON.stringify({ type: "signaling:signal", payload: msg.payload });
          if (wss.clients && typeof wss.clients.forEach === "function") {
            wss.clients.forEach(client => {
              try { client.send(out); } catch (e) { /* ignore */ }
            });
          } else {
            ws.send(out);
          }
          return;
        }
      } catch (err) {
        console.error("signaling WS error:", err);
        try { ws.send(JSON.stringify({ type: "error", message: "Erreur interne signaling" })); } catch(e){}
      }
    });
  }

  return { name: "signaling", initialized: true };
}
