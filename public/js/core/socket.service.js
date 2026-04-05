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
    AppState.wsMaxReconnectAttempts = 10; // Augmenté pour plus de résilience sur Render

    this.listeners = [];
  }

  connect() {
    if (AppState.ws?.readyState === WebSocket.OPEN) return;
    if (AppState.ws?.readyState === WebSocket.CONNECTING) return;

    const token = localStorage.getItem("token");
    if (!token) {
      console.error("❌ Aucun token trouvé — impossible d'ouvrir le WebSocket");
      return;
    }

    // --- 🔹 DÉTECTION DYNAMIQUE DE L'URL WS ---
    let wsUrl;
    const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

    if (isLocal) {
      // En local, on force le port 4000 (ton serveur Node)
      wsUrl = `ws://localhost:4000/?token=${encodeURIComponent(token)}`;
    } else {
      // Sur Render, on utilise l'URL du site en WSS (sécurisé)
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      wsUrl = `${protocol}://${window.location.host}/?token=${encodeURIComponent(token)}`;
    }
    // ------------------------------------------

    console.log("🔌 Tentative de connexion WebSocket vers :", wsUrl);
    
    const ws = new WebSocket(wsUrl);
    AppState.ws = ws;

    ws.onopen = () => {
      console.log("✅ WebSocket connecté");
      AppState.wsConnected = true;
      AppState.wsReconnectAttempts = 0;

      // Identify obligatoire pour le backend
      if (AppState.currentUser) {
        ws.send(JSON.stringify({
          type: "identify",
          userId: AppState.currentUser.id, // S'assurer d'envoyer l'ID
          role: AppState.currentUser.role,
          ...AppState.currentUser
        }));
      }

      while (AppState.wsQueue.length > 0) {
        const queuedMessage = AppState.wsQueue.shift();
        ws.send(JSON.stringify(queuedMessage));
      }
    };

    ws.onclose = (evt) => {
      AppState.wsConnected = false;
      AppState.ws = null;
      console.warn(`⚠️ WebSocket fermé (Code: ${evt.code})`);

      if (evt.code === 1000) return;

      if (AppState.wsReconnectAttempts < AppState.wsMaxReconnectAttempts) {
        AppState.wsReconnectAttempts++;
        const delay = Math.min(RECONNECT_DELAY_MS * AppState.wsReconnectAttempts, MAX_RECONNECT_DELAY_MS);
        setTimeout(() => this.connect(), delay);
      }
    };

    ws.onerror = (err) => {
      console.error("❌ Erreur WebSocket :", err);
    };

    ws.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data);
        this.listeners.forEach(cb => {
          try { cb(data); } catch (err) { console.error("Erreur listener WS :", err); }
        });
      } catch {
        console.warn("Message WS non JSON ignoré :", evt.data);
      }
    };
  }

  send(payload) {
    const ws = AppState.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      if (AppState.wsQueue.length >= MAX_QUEUE_SIZE) AppState.wsQueue.shift();
      AppState.wsQueue.push(payload);
      return;
    }
    ws.send(JSON.stringify(payload));
  }

  onMessage(cb) { if (typeof cb === "function") this.listeners.push(cb); }
  offMessage(cb) { this.listeners = this.listeners.filter(fn => fn !== cb); }

  close() {
    if (AppState.ws) AppState.ws.close(1000, "Déconnexion");
    AppState.ws = null;
    AppState.wsConnected = false;
    AppState.wsQueue = [];
    this.listeners = [];
  }
}

export const SocketService = new SocketServiceCore();