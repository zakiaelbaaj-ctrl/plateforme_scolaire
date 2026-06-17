// ======================================================
// 🎓 ETUDIANT SESSION ORCHESTRATOR
// // CERVEAU GLOBAL (Matching + WebRTC + DataChannel)
// ======================================================
import { AppState }         from "/js/core/state.js";
import { eventBus }          from "/js/core/eventBus.js";
import { Logger as logger } from "/js/lib/logger.js";
import { socketService }     from "/js/core/socket.service.js";

import { handleStudentSocketMessage } from "/js/core/socket.handler.etudiant.js";
import { initEtudiantSessionEvents }  from "./etudiant.session.events.js";
import { EtudiantSessionService }     from "./etudiant.session.service.js";
import { EtudiantMatchingService }    from "./etudiant.matching.service.js";

import { PeerConnection }     from "/js/webrtc/peer.connection.js";
import { DataChannelService } from "/js/domains/webrtc/datachannel.service.js";
import { loadWebRTCConfig }   from "/js/webrtc/webrtc.config.js";

// ======================================================
// STATE
// ======================================================

let peer           = null;
let localStream    = null;
let pendingSignals = [];

// ======================================================
// ORCHESTRATOR
// ======================================================

export const EtudiantSessionOrchestrator = {

  // ====================================================
  // INIT
  // ====================================================
init(uiInterface = null) {
    logger.log("🧠 Orchestrator étudiant initialisé");
    EtudiantSessionService.init();
    EtudiantMatchingService.init();

    socketService.onMessage(handleStudentSocketMessage);

    initEtudiantSessionEvents({
      matchingService: EtudiantMatchingService,
      sessionService:  EtudiantSessionService,
      webrtcService:   this,
      uiService:       uiInterface,
    });

    this._bindEvents();

    // ✅ AJOUT : Connexion WebSocket centralisée ici
    const token = AppState.token || localStorage.getItem("token");
    if (token) {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${location.host}/ws?token=${token}`;
      socketService.connect(wsUrl);
      logger.log("🔌 WebSocket connecté depuis l'orchestrateur");
    } else {
      logger.warn("⚠️ Pas de token — WebSocket non connecté");
    }
},
  // ====================================================
  // EVENTS
  // ====================================================
  _bindEvents() {

    // 🎯 MATCH TROUVÉ : SÉQUENCE UNIQUE ET CENTRALISÉE
    eventBus.on("student:match-found", async ({ roomId, initiator }) => {
      logger.log(`🎯 Match trouvé ! Initialisation séquentielle de la room : ${roomId}`);
      
      // 1️⃣ ALERTER L'ÉTAT GLOBAL & DÉMARRER LES TIMERS
      AppState.startSession({ roomId });

      // 2️⃣ EMISSION DU JOINROOM AU SERVEUR VIA LE SOCKET
      socketService.send({ type: "student:joinRoom", roomId });
      logger.log("🚪 Signal student:joinRoom envoyé de manière centralisée");

      // 3️⃣ LANCEMENT DE WEBRTC IMMÉDIAT (Plus besoin d'attendre un second event volatile)
      logger.log(`🧠 Lancement de WebRTC (Initiateur: ${initiator})`);
      await EtudiantSessionOrchestrator._startWebRTC(initiator);

      // 👇 Ajustement en boucle (Polling) pour la taille du canvas
      let attempts = 0;
      const resizeInterval = setInterval(() => {
        const canvas = document.getElementById("whiteboard-canvas");
        const wrapper = document.getElementById("whiteboard-wrapper");
        
        if (canvas && wrapper) {
          const w = wrapper.offsetWidth || wrapper.parentElement?.offsetWidth || 0;
          const h = wrapper.offsetHeight || wrapper.parentElement?.offsetHeight || 0;
          
          if (w > 50 && h > 50) { 
            canvas.width = w;
            canvas.height = h;
            logger.log(`🎯 Taille du tableau ajustée : ${w}x${h}`);
            
            if (window.WhiteboardService && window.WhiteboardService._canvas) {
              window.WhiteboardService._canvas.redraw();
            }
            
            clearInterval(resizeInterval); 
          }
        }
        
        attempts++;
        if (attempts > 50) { 
          clearInterval(resizeInterval);
          logger.warn("⚠️ Impossible de mesurer la vue, fallback appliqué.");
          if (canvas) { canvas.width = 800; canvas.height = 600; }
        }
      }, 100);
    });
    eventBus.on("student:invited", ({ fromId, fromName, matiere }) => {
    logger.log("🔗 Invitation reçue de :", fromName);
    socketService.send({
        type:    "student:enqueue",
        matiere: matiere || "Général",
        sujet:   "",
    });
});
    eventBus.on("socket:open", () => {
    const user = AppState.currentUser;
    // ✅ Délai pour s'assurer que le socket est prêt
     setTimeout(() => {
    console.log("IDENTIFY DEBUG USER =", user);
    console.log("VILLE DEBUG =", user?.ville);
   console.log("PAYS DEBUG  =", user?.pays);
   console.log("DEBUG CURRENT USER FULL =", AppState.currentUser);
    socketService.send({
        type:    "identify",
        prenom:  user?.prenom  || "",
        nom:     user?.nom     || "",
        ville:   user?.ville   || "",
        pays:    user?.pays    || "",
        niveau:  user?.niveau  || null,
        matiere: user?.matiere || "Général",
    });
    logger.log("🪪 Identify envoyé au serveur");
    }, 300);
});
// ✅ COLLER ICI — Détecter si l'étudiant arrive via un lien d'invitation
const params = new URLSearchParams(window.location.search);
const inviteId = params.get("invite");
console.log("🔗 URL complète :", window.location.href);
console.log("🔗 inviteId détecté :", inviteId);
if (inviteId) {
    logger.log("🔗 Invitation détectée — userId invitant :", inviteId);
    AppState.pendingInviteId = inviteId;
}

if (inviteId) {
    logger.log("🔗 Invitation détectée — userId invitant :", inviteId);
    AppState.pendingInviteId = inviteId;
    
    // ✅ Nettoyer l'URL sans recharger la page
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
}
// ✅ Lancement matching automatique quand l'invitant est trouvé en ligne
eventBus.on("invite:found", ({ invitant }) => {
    const matiere = AppState.currentUser?.matiere || "Général";
    socketService.send({
        type:     "student:enqueue",
        matiere,
        sujet:    "",
        inviteId: invitant.id
    });
    logger.log("🔗 Enqueue automatique vers :", invitant.prenom);
});
    // 📡 SIGNAL WEBRTC 🕒 mise en queue si peer pas encore prêt
    eventBus.on("webrtc:signal", async (signal) => {
      if (!peer) {
        pendingSignals.push(signal);
        return;
      }
      await EtudiantSessionOrchestrator._handleSignal(signal);
    });

    // 🕒 USER LEFT
    eventBus.on("student:user-left", () => {
      logger.log("🧠 Partenaire parti");
      this._cleanup({ reason: "user-left" });
    });

    // 🕒 FIN SESSION (bouton quitter)
    eventBus.on("session:end", () => {
      this._cleanup({ reason: "ended" });
    });

    // 💬 ÉCOUTEUR D'ENVOI DU CHAT LOCAL VIA WEBRTC
    eventBus.on("chat:send-local", (text) => {
      logger.log("🧠 Orchestrator : Envoi du message via DataChannel");
      this.sendChat(text); 
    });
  },

  // ====================================================
  // WEBRTC START
  // ====================================================

  async _startWebRTC(isInitiator) {
    logger.log("🧠 Démarrage WebRTC ― initiateur :", isInitiator);

    const config = await loadWebRTCConfig(AppState.token);

    peer = new PeerConnection({ config });
    peer.create();

    // Handler peer.onTrack
    peer.onTrack((stream, track) => {
      const videoReceivers = peer.getPC()
        .getReceivers()
        .filter(r => r.track?.kind === "video" && r.track.readyState === "live");

      logger.log(`🧠 Flux distant reçu — videoReceivers: ${videoReceivers.length}`);

      if (videoReceivers.length > 1) {
        logger.log("📺 Track écran partagé reçue");
        eventBus.emit("screenshare:remote-stream", stream);
      } else {
        eventBus.emit("media:remote-stream", stream);
      }
    });

    peer.onIceCandidate((candidate) => {
      EtudiantSessionService.sendSignal({
        type:      "ice-candidate",
        candidate,
      });
    });

    peer.onStateChange((state) => {
      logger.log("🧠 WebRTC state :", state);
      eventBus.emit("webrtc:state", state);
      if (state === "failed" || state === "disconnected") {
        this._cleanup({ reason: "failed" });
      }
    });

    // MEDIA LOCAL
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      logger.log("🧠 Caméra locale activée");
      peer.addLocalStream(localStream);
      eventBus.emit("media:local-stream", localStream);
    } catch (err) {
      if (err.name === "NotFoundError" || err.message.includes("Could not start video source")) {
        logger.warn("⚠️ Aucune caméra détectée sur cet appareil.");
        const camStatus = document.getElementById('call-status');
        if (camStatus) camStatus.textContent = "⚠️ Pas de caméra ― mode tableau blanc";
      } else {
        logger.warn("⚠️ Caméra non accessible :", err.message);
      }
      logger.log("Continuité de la session sans média local (Tableau blanc actif).");
    }

    // DATACHANNEL 
    DataChannelService.init(peer.getPC(), isInitiator, {
      onChat: (text) => {
          const partnerName = AppState.partnerName || "Partenaire";
          eventBus.emit("chat:message", { sender: partnerName, text });
      },
      onStroke:       (stroke)         => eventBus.emit("whiteboard:stroke", stroke),
      onText:         (text)           => eventBus.emit("whiteboard:text",   text),
      onClear:        ()               => eventBus.emit("whiteboard:clear"),
      onFileComplete: (file)           => eventBus.emit("file:received",     file),
      onFileProgress: (id, progress)   => eventBus.emit("file:progress",     { id, progress }),
      onFileMeta:     (meta)           => eventBus.emit("file:meta",         meta),
      onFileEnd:      (meta)           => eventBus.emit("file:end",          meta),
      onDrawReady: () => {
        logger.log("✅ Channel draw prêt ― envoi fichier autorisé");
        eventBus.emit("file:channel-ready");
      },
    });

    // FLUSH signaux en attente
    if (pendingSignals.length > 0) {
      logger.log(`🧠 Flush ${pendingSignals.length} signaux en attente`);
      for (const signal of pendingSignals) {
        // ✅ Sécurisation de l'appel contextuel lors du dépilement asynchrone
        await EtudiantSessionOrchestrator._handleSignal(signal);
      }
      pendingSignals = [];
    }

    // OFFRE SDP (initiateur uniquement)
    if (isInitiator) {
      try {
        const offerOptions = {
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        };

        const offer = await peer.createOffer(offerOptions);
        
        EtudiantSessionService.sendSignal({
          type: "offer",
          sdp:  offer.sdp,
        });
        logger.log("🧠 Offre SDP envoyée avec succès via le wrapper");
      } catch (err) {
        logger.error("❌ Erreur création offre :", err);
      }
    }
  },

  // ====================================================
  // SIGNAL HANDLER
  // ====================================================

  async _handleSignal(signal) {
    if (!peer) {
      logger.warn("⚠️ Signal reçu sans peer ― ignoré :", signal.type);
      return;
    }

    try {
      if (signal.type === "offer") {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        const answer = await peer.createAnswer();
        EtudiantSessionService.sendSignal({ type: "answer", sdp: answer.sdp });
        logger.log("🧠 Réponse SDP envoyée");

      } else if (signal.type === "answer") {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });

      } else if (signal.type === "ice-candidate") {
        await peer.addIceCandidate(signal.candidate);
      }

    } catch (err) {
      logger.error("❌ Signal error :", err);
    }
  },

  // ====================================================
  // ACTIONS PUBLIQUES
  // ====================================================

  sendChat(text) {
    if (!AppState.sessionInProgress) return;
    DataChannelService.sendChat(text);
  },

  sendStroke(stroke) {
    DataChannelService.sendStroke(stroke);
  },

  sendText(text) {
    DataChannelService.sendText(text);
  },

  clearBoard() {
    DataChannelService.clear();
  },

  sendFile(file) {
    DataChannelService.sendFile?.(file);
  },

  leaveSession() {
    EtudiantSessionService.leaveRoom();
    this._cleanup({ reason: "left" });
  },

  // ====================================================
  // PARTAGE D'ÉCRAN
  // ====================================================

  _screenStream: null,
  _screenTrack:  null,
  _screenSender: null,

  async startScreenShare() {
    if (this._screenStream) return; 
    if (!peer) { logger.warn("⚠️ Pas de peer actif"); return; }

    try {
      this._screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false
      });

      this._screenTrack = this._screenStream.getVideoTracks()[0];
      if (!this._screenTrack) throw new Error("Pas de piste vidéo écran");

      this._screenSender = peer.getPC().addTrack(
        this._screenTrack,
        this._screenStream
      );

      const offer = await peer.createOffer();
      EtudiantSessionService.sendSignal({ type: "offer", sdp: offer.sdp });

      this._screenTrack.onended = () => this.stopScreenShare();

      eventBus.emit("screenshare:started");
      logger.log("📺 Partage d'écran démarré");

    } catch (err) {
      if (err.name !== "NotAllowedError") {
        logger.error("❌ ScreenShare error:", err);
      }
      this._cleanupScreenShare();
    }
  },

  async stopScreenShare() {
    if (!this._screenStream) return;

    if (peer && this._screenSender) {
      try { peer.getPC().removeTrack(this._screenSender); } catch {}
    }
    if (peer) {
      try {
        const offer = await peer.createOffer();
        EtudiantSessionService.sendSignal({ type: "offer", sdp: offer.sdp });
      } catch {}
    }

    eventBus.emit("screenshare:stopped");
    this._cleanupScreenShare();
    logger.log("📺 Partage d'écran arrêté");
  },

  _cleanupScreenShare() {
    this._screenTrack?.stop();
    this._screenStream?.getTracks().forEach(t => t.stop());
    this._screenStream = null;
    this._screenTrack  = null;
    this._screenSender = null;
  },

  isScreenSharing() {
    return !!this._screenStream;
  },

  // ====================================================
  // CLEANUP
  // ====================================================

  _cleanup(reason = "") {
    logger.log("🧹 Cleanup orchestrator :", reason);

    this._cleanupScreenShare?.();

    if (peer) {
      peer.destroy();
      peer = null;
    }

    pendingSignals = [];

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    DataChannelService.reset();

    AppState.currentRoomId     = null;
    AppState.sessionInProgress = false;

    eventBus.emit("screenshare:stopped");
    eventBus.emit("session:reset", { reason });
  }
};