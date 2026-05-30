// ======================================================
// ETUDIANT SESSION EVENTS
// Couche d'abstraction EventBus (mapping métier)
// ======================================================

import { eventBus } from "/js/core/eventBus.js";
import { Logger }   from "/js/lib/logger.js";

// ======================================================
// REGISTRATION
// ======================================================

export function initEtudiantSessionEvents({
  matchingService,
  sessionService,
  webrtcService,
  uiService,
}) {

  Logger.log("📡 EtudiantSessionEvents initialisé");

  // ====================================================
  // 🕒 SOCKET / SESSION LIFECYCLE
  // ====================================================

  eventBus.on("socket:open", () => {
    Logger.log("📥 Socket ouvert");
  });

  eventBus.on("socket:close", () => {
    Logger.warn("⚠️ Socket fermé");
  });

  // ====================================================
  // 🎯 MATCHING
  // ====================================================

  eventBus.on("matching:queued", (data) => {
    uiService?.onQueued?.(data);
  });

  eventBus.on("matching:cancelled", () => {
    uiService?.onQueueCancelled?.();
  });

  eventBus.on("matching:status", (data) => {
    uiService?.onQueueStatus?.(data);
  });

  eventBus.on("student:match-found", (data) => {
    Logger.log("📥 MATCH EVENT");

    uiService?.onMatchFound?.(data);
    sessionService?.onMatchFound?.(data);
    webrtcService?.onMatchFound?.(data);
  });

  // ====================================================
  // 📦 SESSION ROOM
  // ====================================================

  eventBus.on("student:joined-room", (data) => {
    uiService?.onRoomJoined?.(data);
  });

  eventBus.on("student:user-joined", (data) => {
    uiService?.onUserJoined?.(data);
  });

  eventBus.on("student:user-left", (data) => {
    Logger.warn("👋 User left room");
    uiService?.onUserLeft?.(data);
    webrtcService?.onPeerLeft?.(data);
  });

  eventBus.on("session:reset", () => {
    uiService?.onSessionReset?.();
  });

  // ====================================================
  // 🕒 WEBRTC SIGNALING
  // ====================================================

  eventBus.on("webrtc:signal", (signal) => {
    webrtcService?.handleSignal?.(signal);
  });

  // ====================================================
  // 📮 CHAT (fallback serveur)
  // ====================================================

  eventBus.on("chat:message", (msg) => {
    uiService?.onChatMessage?.(msg);
  });

  // ====================================================
  // 📁 DOCUMENTS (fallback serveur)
  // ====================================================

  eventBus.on("document:received", (doc) => {
    uiService?.onDocument?.(doc);
  });
  eventBus.on("file:received", (file) => {
    uiService?.onDocument?.(file);
});

  // ====================================================
  // Subscription
  // ====================================================

  eventBus.on("subscription:required", () => {
    uiService?.onSubscriptionRequired?.();
  });

  eventBus.on("subscription:active", () => {
    uiService?.onSubscriptionActive?.();
  });

  // ====================================================
  // 🕒 TIMER SESSION
  // ====================================================

  eventBus.on("timer:update", (seconds) => {
    uiService?.onTimerUpdate?.(seconds);
  });

  eventBus.on("timer:reset", () => {
    uiService?.onTimerReset?.();
  });

  // ====================================================
  // 🕵️ DEBUG GLOBAL
  // ====================================================

  eventBus.on("*", (event, payload) => {
    Logger.log("📥 EVENT:", event, payload);
  });
}
