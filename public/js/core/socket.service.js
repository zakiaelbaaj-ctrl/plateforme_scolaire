// public/js/core/socket.service.js
import { WSLogger } from "./ws.logger.js";

/* ======================================================
   CONFIG (INFRA ONLY)
====================================================== */
const CONFIG = {
  RECONNECT_BASE_MS: 1000,
  RECONNECT_MAX_MS: 30000,
  MAX_QUEUE_SIZE: 100,
  HEARTBEAT_INTERVAL_MS: 25000,
  HEARTBEAT_TIMEOUT_MS: 60000,
};

/* ======================================================
   SOCKET SERVICE (TRANSPORT PUR)
====================================================== */
class SocketService {
  constructor() {
    this.ws = null;

    // listeners globaux uniquement (pas de typage métier)
    this.listeners = new Set();

    this.queue = [];

    this.reconnectAttempts = 0;
    this.manualClose = false;

    this.heartbeatInterval = null;
    this.lastPong = null;

    this.currentUrl = null; // pour reconnect
  }

  /* ======================================================
     CONNECT (URL FOURNIE PAR L’EXTÉRIEUR)
  ====================================================== */
  connect(url) {
    if (!url) {
      WSLogger.error("WS connect: URL manquante");
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.ws?.readyState === WebSocket.CONNECTING) return;

    this.currentUrl = url;

    WSLogger.info("WS connect", url);

    this.ws = new WebSocket(url);

    /* ======================
       OPEN
    ====================== */
    this.ws.onopen = () => {
      WSLogger.info("WS connecté");

      this.reconnectAttempts = 0;
      this.manualClose = false;

      this.startHeartbeat();
      this.flushQueue();

      // 🔥 On notifie sans logique métier
      this.emit({ type: "TRANSPORT_OPEN" });
    };

    /* ======================
       MESSAGE
    ====================== */
    this.ws.onmessage = (evt) => {
      let data;

      try {
        data = JSON.parse(evt.data);
      } catch {
        WSLogger.warn("WS non JSON", evt.data);
        return;
      }

      // heartbeat interne uniquement
      if (data.type === "pong") {
        this.lastPong = Date.now();
        return;
      }

      // 🔥 FORWARD PUR
      this.emit(data);
    };

    /* ======================
       CLOSE
    ====================== */
    this.ws.onclose = (evt) => {
      WSLogger.warn("WS fermé", evt.code);

      this.stopHeartbeat();

      this.emit({
        type: "TRANSPORT_CLOSED",
        code: evt.code,
      });

      if (!this.manualClose && evt.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    /* ======================
       ERROR
    ====================== */
    this.ws.onerror = (err) => {
      WSLogger.error("WS erreur", err);
    };
  }

  /* ======================================================
     SEND (QUEUE SAFE)
  ====================================================== */
  send(payload) {
    if (!payload) return;

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      if (this.queue.length >= CONFIG.MAX_QUEUE_SIZE) {
        this.queue.shift();
      }
      this.queue.push(payload);
    }
  }

  flushQueue() {
    while (this.queue.length > 0) {
      const msg = this.queue.shift();
      this.send(msg);
    }
  }

  /* ======================================================
     EVENT SYSTEM (TRANSPORT ONLY)
  ====================================================== */
  onMessage(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb); // unsubscribe
  }

  emit(data) {
    this.listeners.forEach((cb) => {
      try {
        cb(data);
      } catch (e) {
        WSLogger.error("WS listener error", e);
      }
    });
  }

  /* ======================================================
     HEARTBEAT (INTERNE)
  ====================================================== */
  startHeartbeat() {
    this.stopHeartbeat();

    this.lastPong = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;

      this.ws.send(JSON.stringify({ type: "ping" }));

      if (Date.now() - this.lastPong > CONFIG.HEARTBEAT_TIMEOUT_MS) {
        WSLogger.warn("WS timeout");
        this.ws.close();
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.heartbeatInterval = null;
  }

  /* ======================================================
     RECONNECT (INFRA)
  ====================================================== */
  scheduleReconnect() {
    this.reconnectAttempts++;

    const delay = Math.min(
      CONFIG.RECONNECT_BASE_MS * this.reconnectAttempts,
      CONFIG.RECONNECT_MAX_MS
    );

    WSLogger.info(`Reconnect dans ${delay}ms`);

    setTimeout(() => {
      if (this.currentUrl) {
        this.connect(this.currentUrl);
      }
    }, delay);
  }

  /* ======================================================
     CLOSE CLEAN
  ====================================================== */
  close() {
    this.manualClose = true;

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close(1000, "manual");
    }

    this.ws = null;

    // 🔥 IMPORTANT : garder la même référence si exposée ailleurs
    this.queue.length = 0;

    this.listeners.clear();
  }
}

/* ======================================================
   EXPORT SINGLETON
====================================================== */
export const socketService = new SocketService();
