// ws/index.js
// Bootstrap WebSocket : démarrage global et initialisation des domaines

import { WebSocketServer } from "ws";
import { startTimerScheduler } from "./timerManager.js";
import { startMetricsServer, setConnections, incMessage } from "./metrics.js";
import { registerSocket, unregisterSocket, snapshot } from "./state.js";
import { safeSend, parseMessage } from "./utils.js";

import initChatWS from "./chat/init.js";
import initSignalingWS from "./signaling/init.js";
import initMatieresWS from "./matieres/init.js";
import initAuthWS from "./auth/init.js";
import initAppelWS from "./appel/init.js";

/**
 * Initialise le WebSocketServer et les domaines WS.
 *
 * @param {WebSocketServer} wss - instance de WebSocketServer
 * @param {object} deps - dépendances injectées (logger, db, services, etc.)
 */
export default function initWebSocket(wss, deps = {}) {
  // Démarrages globaux (idempotents)
  startTimerScheduler();
  startMetricsServer();

  // Initialisation des domaines (ils peuvent attacher leurs propres listeners)
  initAuthWS(wss, deps);
  initChatWS(wss, deps);
  initAppelWS(wss, deps);
  initSignalingWS(wss, deps);
  initMatieresWS(wss, deps);

  // Gestion des connexions WS
  if (wss) {
    wss.on("connection", (ws, req) => {
      // Générer un socketId stable côté serveur
      const socketId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      ws.id = socketId;

      // Enregistrer la socket
      try {
        registerSocket(socketId, ws);
      } catch (err) {
        console.error("registerSocket error", err);
      }

      // Mettre à jour métriques de connexions
      try {
        const snap = snapshot();
        setConnections(snap.clients.length); // snapshot.clients est un Array
      } catch {}

      // Heartbeat minimal
      ws.isAlive = true;
      ws.on("pong", () => (ws.isAlive = true));

      // Message router minimal
      ws.on("message", (raw) => {
        const msg = parseMessage(raw);
        if (!msg) {
          safeSend(ws, { type: "error", message: "Invalid payload" });
          return;
        }

        // incrément métriques
        try {
          incMessage(msg.type || "unknown");
        } catch {}

        // Émettre l'événement pour les domaines
        try {
          wss.emit("ws:message", ws, msg);
        } catch {}
      });

      // Nettoyage à la fermeture
      ws.on("close", () => {
        try {
          unregisterSocket(ws.id);
        } catch (err) {
          console.error("unregisterSocket error", err);
        }

        try {
          const snap = snapshot();
          setConnections(snap.clients.length);
        } catch {}
      });

      ws.on("error", (err) => {
        console.error("ws error", err?.message || err);
      });
    });
  }

  logger.info("🔌 WebSocket bootstrap completed: domains initialized");
}
