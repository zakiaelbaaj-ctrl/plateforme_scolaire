// ======================================================
// ETUDIANT SESSION SERVICE
// Orchestration côté client (WS + EventBus + AppState)
// ======================================================

import { socketService } from "/js/core/socket.service.js";
import { AppState }      from "/js/core/state.js";
import { eventBus }      from "/js/core/eventBus.js";
import { Logger }        from "/js/lib/logger.js";

// ======================================================
// SERVICE
// ======================================================

export const EtudiantSessionService = (() => {

  // ====================================================
  //ÉTAT LOCAL
  // ====================================================

  let initialized = false;

  // ====================================================
  // INIT
  // ====================================================

  function init() {
    if (initialized) return;
    initialized = true;

    Logger.log("🧠 EtudiantSessionService initialisé");

    bindEventBus();
    // ✅ AJOUT — sans ça, le socket ne démarre jamais
    const token  = localStorage.getItem("token");
    if (!token) {
        Logger.warn("⚠️ Pas de token — connexion WS impossible");
        return;
    }
    const HOST   = window.location.hostname === "localhost"
      ? "ws://localhost:4000"
      : "wss://plateforme-scolaire-1.onrender.com";
      const WS_URL = `${HOST}?token=${token}`;
      socketService.connect(WS_URL);
  }

  // ====================================================
  // EVENT BUS LISTENERS
  // ====================================================

  function bindEventBus() {

    // Quand socket ouverte → identification
    eventBus.on("socket:open", () => {
    setTimeout(() => {
        identify();
    }, 300);
});

    // Quand match trouvé → rejoindre room
    eventBus.on("student:match-found", ({ roomId }) => {
      AppState.currentRoomId     = roomId;
      AppState.sessionInProgress = true;
      // Optionnel : rejoindre la room automatiquement si le matching suffit
      joinRoom(roomId);
    });

    // Quand user quitte → cleanup état
    eventBus.on("student:user-left", () => {
      resetSessionState();
    });
  }

  // ====================================================
  // IDENTIFICATION
  // ====================================================

  function identify() {
    const u = AppState.currentUser;
    if (!u) {
      Logger.warn("⚠️ Impossible d’identifier : utilisateur manquant");
      return;
    }
    if (!u.prenom) {
        Logger.warn("⚠️ currentUser existe mais prenom est vide — identify annulé");
        return;
    }
    // ✅ AJOUT — confirmer l'état du socket au moment de l'envoi

    socketService.send({
      type:    "identify",
      role:    "etudiant",
      prenom:  u.prenom  || "",
      nom:     u.nom     || "",
      ville:   u.ville   || "",
      pays:    u.pays    || "",
      matiere: u.matiere || "",
      niveau:  u.niveau  || "",
    });

    Logger.log("✅ Identification envoyée (étudiant)");
    
  }

  // ====================================================
  // 🎯 MATCHMAKING
  // ====================================================

  function enqueue(matiere, sujet = "") {
    if (!matiere) {
      Logger.warn("⚠️ enqueue sans matière");
      return;
    }

    socketService.send({
      type:    "student:enqueue",
      matiere,
      sujet,
    });

    AppState.isQueueing = true;

    Logger.log("🎯 Enqueue :", matiere);
  }

  function dequeue() {
    socketService.send({
      type: "student:dequeue",
    });

    AppState.isQueueing = false;

    Logger.log("❌ Dequeue");
  }

  // ====================================================
  // 📦 SESSION
  // ====================================================

  function joinRoom(roomId) {
    if (!roomId) return;

    socketService.send({
      type:   "student:join-room",
      roomId,
    });

    AppState.currentRoomId     = roomId;
    AppState.sessionInProgress = true;

    Logger.log("📦 Join room :", roomId);
  }

  function leaveRoom() {
    socketService.send({
      type: "student:leave-room",
    });

    resetSessionState();

    Logger.log("🚪 Leave room");
  }

  function resetSessionState() {
    AppState.currentRoomId     = null;
    AppState.sessionInProgress = false;
    AppState.isQueueing        = false;

    eventBus.emit("session:reset");
  }

  // ====================================================
  //¡ SIGNALING WEBRTC
  // ====================================================

  function sendSignal(signal) {
    if (!signal?.type) {
      Logger.warn("⚠️ Signal invalide :", signal);
      return;
    }

    socketService.send({
      type:   "student:signal",
      roomId: AppState.currentRoomId,
      signal,
    });

    Logger.log("✅ Signal envoyé :", signal.type);
  }

  // ====================================================
  // 📮 CHAT (Envoi Mixte : WebRTC principal + WS historique)
  // ====================================================

  function sendChat(text) {
    if (!text) return;

    // 1. 🚀 ENVOI DIRECT VIA WEBRTC (Pour que Fady le reçoive instantanément)
    // On émet un événement interne que l'Orchestrateur va intercepter pour appeler son DataChannel
    eventBus.emit("chat:send-local", text);

    // 2. 📡 ENVOI AU SERVEUR (Historique / Fallback)
    // Correction du type : "student:chatMessage" pour correspondre au format attendu
    socketService.send({
      type: "student:chatMessage", 
      text,
    });
  }
  // ====================================================
  // 📁 DOCUMENT (fallback serveur)
  // ====================================================

  function sendDocument(fileName, fileData) {
    if (!fileName || !fileData) return;

    socketService.send({
      type:     "student:document",
      fileName,
      fileData,
    });

    Logger.log("📁 Document envoyé :", fileName);
  }

  // ====================================================
  // 🕵️ ONLINE USERS
  // ====================================================

  function requestOnlineStudents() {
    socketService.send({
      type: "student:get-online",
    });
  }

  // ====================================================
  // PUBLIC API
  // ====================================================

  return {
    init,

    // matchmaking
    enqueue,
    dequeue,

    // session
    joinRoom,
    leaveRoom,

    // webrtc
    sendSignal,

    // fallback
    sendChat,
    sendDocument,

    // utils
    requestOnlineStudents,
  };

})();
