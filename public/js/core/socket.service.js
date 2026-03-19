// public/js/core/socket.service.js
import { AppState } from "./state.js";

const RECONNECT_DELAY_MS     = 2000;
const MAX_QUEUE_SIZE         = 100;
const MAX_RECONNECT_DELAY_MS = 30000;

class SocketServiceCore {

  constructor() {
    AppState.ws = null;
    AppState.wsQueue = [];
    AppState.wsConnected = false;
    AppState.wsReconnectAttempts = 0;
    AppState.wsMaxReconnectAttempts = 5;

    this.listeners = [];
  }

  connect() {
    // Empêche double connexion
    if (AppState.ws?.readyState === WebSocket.OPEN) return;
    if (AppState.ws?.readyState === WebSocket.CONNECTING) return;

    // 🔐 Token obligatoire pour le backend
    const token = localStorage.getItem("token");
    if (!token) {
      console.error("❌ Aucun token trouvé — impossible d'ouvrir le WebSocket");
      return;
    }

    // 🔒 Auto-détection ws / wss
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(wsUrl);
    AppState.ws = ws;

    ws.onopen = () => {
      AppState.wsConnected = true;
      AppState.wsReconnectAttempts = 0;

      // Identify obligatoire pour le backend
      if (AppState.currentUser) {
        ws.send(JSON.stringify({
          type: "identify",
          ...AppState.currentUser
        }));
      }

      // Envoi de la queue
      while (AppState.wsQueue.length > 0) {
        const queuedMessage = AppState.wsQueue.shift();
        ws.send(JSON.stringify(queuedMessage));
      }
    };

    ws.onclose = (evt) => {
      AppState.wsConnected = false;
      AppState.ws = null;

      // Fermeture propre → pas de reconnexion
      if (evt.code === 1000) return;

      // Tentatives limitées
      if (AppState.wsReconnectAttempts < AppState.wsMaxReconnectAttempts) {
        AppState.wsReconnectAttempts++;

        const delay = Math.min(
          RECONNECT_DELAY_MS * AppState.wsReconnectAttempts,
          MAX_RECONNECT_DELAY_MS
        );

        setTimeout(() => this.connect(), delay);
      } else {
        console.warn("⚠️ Nombre maximal de tentatives de reconnexion atteint.");
      }
    };

    ws.onerror = (err) => {
      console.error("❌ Erreur WebSocket :", err);
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        this.listeners.forEach(cb => {
          try {
            cb(data);
          } catch (err) {
            console.error("Erreur listener WS :", err);
          }
        });
      } catch {
        console.warn("Message WS non JSON ignoré :", evt.data);
      }
    };
  }

  send(payload) {
    const ws = AppState.ws;

    if (!ws || ws.readyState !== WebSocket.OPEN) {
      // Gestion limite queue
      if (AppState.wsQueue.length >= MAX_QUEUE_SIZE) {
        AppState.wsQueue.shift();
      }

      AppState.wsQueue.push(payload);
      return;
    }

    ws.send(JSON.stringify(payload));
  }

  onMessage(cb) {
    if (typeof cb === "function") {
      this.listeners.push(cb);
    }
  }

  offMessage(cb) {
    this.listeners = this.listeners.filter(fn => fn !== cb);
  }

  close() {
    if (AppState.ws) {
      AppState.ws.close(1000, "Déconnexion");
    }

    AppState.ws = null;
    AppState.wsConnected = false;
    AppState.wsReconnectAttempts = 0;
    AppState.wsQueue = [];
    this.listeners = [];
  }
}

export const SocketService = new SocketServiceCore();