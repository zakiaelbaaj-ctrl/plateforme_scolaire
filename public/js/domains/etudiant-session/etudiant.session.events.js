// ======================================================
// 🎓 ETUDIANT SESSION EVENTS
// // Couche d'abstraction EventBus (mapping UI Passif)
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
  // 👥 UTILISATEURS EN LIGNE (Correction du Bug Visuel)
  // ====================================================

  /**
   * Capté depuis le socket handler lors de la trame student:onlineStudents.
   * Transmet la liste brute au service UI pour génération du HTML.
   */
  eventBus.on("students:online", (students) => {
    Logger.log("📺 UI Events : Reçu liste des étudiants connectés, transfert à l'UI...", students);
    
    // Ajoute ici l'appel vers ta méthode de rendering d'interface
    if (uiService && typeof uiService.renderOnlineStudents === "function") {
      uiService.renderOnlineStudents(students);
    } else if (uiService && typeof uiService.onOnlineStudents === "function") {
      uiService.onOnlineStudents(students);
    } else {
      // Fallback au cas où ton uiService posséderait un autre nom de callback
      uiService?.onStudentsOnline?.(students);
    }
  });

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
  // 🎯 MATCHING (Flux d'entrée en file d'attente)
  // ====================================================

  eventBus.on("student:queued", (data) => {
    uiService?.onQueued?.(data);
  });

  eventBus.on("student:dequeued", () => {
    uiService?.onQueueCancelled?.();
  });

  // 🎯 MATCH TROUVÉ : Rôle 100% Passif / UI pour ce fichier
  eventBus.on("student:match-found", (data) => {
    Logger.log("📥 UI Events : Match détecté, ordre d'affichage envoyé à l'UI.");
    
    // L'UI bascule l'affichage en mode session (affiche le tableau blanc, coupe le loader)
    uiService?.onMatchFound?.(data); 
    
    // 🛑 SUPPRESSION DES APPELS LOGIQUES : L'orchestrateur s'est déjà abonné 
    // en direct à cet événement pour lancer le joinRoom et le WebRTC.
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
    Logger.warn("👋 UI Events : Le partenaire a quitté la room");
    
    // On notifie uniquement l'interface visuelle pour masquer la classe
    uiService?.onUserLeft?.(data);
    
    // 🛑 SUPPRESSION : L'orchestrateur écoute déjà cet événement en direct 
    // et exécute de manière synchrone son master _cleanup().
  });

  eventBus.on("session:reset", () => {
    uiService?.onSessionReset?.();
  });

  // ====================================================
  // 🕒 WEBRTC SIGNALING (Passerelle directe vers l'orchestrateur)
  // ====================================================

  eventBus.on("webrtc:signal", (signal) => {
    webrtcService?.handleSignal?.(signal);
  });

  // ====================================================
  // 📮 CHAT & DOCUMENTS (Routage passif vers l'UI)
  // ====================================================

  eventBus.on("chat:message", (msg) => {
    uiService?.onChatMessage?.(msg);
  });

  eventBus.on("document:received", (doc) => {
    uiService?.onDocument?.(doc);
  });
  
  eventBus.on("file:received", (file) => {
    uiService?.onDocument?.(file);
  });

  // ====================================================
  // 💳 ABONNEMENT / STRIPE
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
}