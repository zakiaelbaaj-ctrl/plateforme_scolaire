// public/js/core/socket.service.js
import { WSLogger } from "./ws.logger.js";

const CONFIG = {
  RECONNECT_BASE_MS: 1000,
  RECONNECT_MAX_MS: 30000,
  MAX_QUEUE_SIZE: 100,
  HEARTBEAT_INTERVAL_MS: 25000,
  HEARTBEAT_TIMEOUT_MS: 60000,
};

class SocketService {
  constructor() {
    this.ws = null;

    this.listeners = new Set();
    this.queue = [];

    this.currentUrl = null;

    this.reconnectAttempts = 0;
    this.manualClose = false;

    this.heartbeatInterval = null;
    this.lastPong = null;

    this.reconnectTimeout = null;
  }

  /* ======================================================
     CONNECT
  ====================================================== */
  connect(url) {
    if (!url) {
      WSLogger.error("WS connect: URL manquante");
      return;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return;

    this.currentUrl = url;

    WSLogger.info("WS connect", url);

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      WSLogger.info("WS connectÃ©");

      this.reconnectAttempts = 0;
      this.manualClose = false;

      this.startHeartbeat();
      this.flushQueue();

      this.emit({ type: "TRANSPORT_OPEN" });
    };

    this.ws.onmessage = (evt) => {
      let data;

      try {
        data = JSON.parse(evt.data);
      } catch (e) {
        WSLogger.warn("WS message non JSON", evt.data);
        return;
      }

      if (data.type === "pong") {
        this.lastPong = Date.now();
        return;
      }

      this.emit(data);
    };

    this.ws.onclose = (evt) => {
      WSLogger.warn("WS fermÃ©", evt.code);

      this.stopHeartbeat();

      this.emit({
        type: "TRANSPORT_CLOSED",
        code: evt.code,
      });

      if (!this.manualClose && evt.code !== 1000) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      WSLogger.error("WS erreur", err);
    };
  }

  /* ======================================================
     SEND SAFE
  ====================================================== */
  send(payload) {
    if (!payload) return;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
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
     EVENTS
  ====================================================== */
  onMessage(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
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
     HEARTBEAT
  ====================================================== */
  startHeartbeat() {
    this.stopHeartbeat();

    this.lastPong = Date.now();

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

      this.send({ type: "ping" });

      const diff = Date.now() - this.lastPong;

      if (diff > CONFIG.HEARTBEAT_TIMEOUT_MS) {
        WSLogger.warn("WS timeout â†’ reconnect forced");
        this.ws.close();
      }
    }, CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /* ======================================================
     RECONNECT
  ====================================================== */
  scheduleReconnect() {
    this.reconnectAttempts++;

    const delay = Math.min(
      CONFIG.RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      CONFIG.RECONNECT_MAX_MS
    );

    WSLogger.info(`Reconnect dans ${delay}ms`);

    clearTimeout(this.reconnectTimeout);

    this.reconnectTimeout = setTimeout(() => {
      if (this.currentUrl) {
        this.connect(this.currentUrl);
      }
    }, delay);
  }

  /* ======================================================
     CLOSE MANUAL
  ====================================================== */
  close() {
    this.manualClose = true;

    this.stopHeartbeat();

    clearTimeout(this.reconnectTimeout);

    if (this.ws) {
      this.ws.close(1000, "manual");
    }

    this.ws = null;
  }
}

export const socketService = new SocketService();
window.socketService = socketService;

export const registerWsHandler = (cb) => socketService.onMessage(cb);
export const sendWs = (data) => socketService.send(data);

