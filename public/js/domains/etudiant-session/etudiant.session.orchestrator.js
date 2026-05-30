// ======================================================
// 🎓 ETUDIANT SESSION ORCHESTRATOR
// // CERVEAU GLOBAL (Matching + WebRTC + DataChannel)
// ======================================================
import { AppState }          from "/js/core/state.js";
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
import { setAuthProvider }    from "/js/lib/http.js";

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

    // Branchement unique du socket handler étudiant
    // NE PAS brancher ailleurs (socket.service.js ne doit
    // pas importer handleStudentSocketMessage)
    socketService.onMessage(handleStudentSocketMessage);

    initEtudiantSessionEvents({
      matchingService: EtudiantMatchingService,
      sessionService:  EtudiantSessionService,
      webrtcService:   this,
      uiService:       uiInterface,
    });

    this._bindEvents();
  },

  // ====================================================
  // EVENTS
  // ====================================================
    _bindEvents() {

    // 🎯 MATCH TROUVÉ
eventBus.on("student:match-found", ({ roomId }) => {
  logger.log("🎯 Match trouvé :", roomId);
  AppState.currentRoomId     = roomId;
  AppState.sessionInProgress = true;

  // 👇 AJOUT : Vérification en boucle (Polling)
      let attempts = 0;
      const resizeInterval = setInterval(() => {
        const canvas = document.getElementById("whiteboard-canvas");
        const wrapper = document.getElementById("whiteboard-wrapper");
        
        if (canvas && wrapper) {
          // On cherche une taille valide dans le wrapper, sinon dans son conteneur parent
          const w = wrapper.offsetWidth || wrapper.parentElement?.offsetWidth || 0;
          const h = wrapper.offsetHeight || wrapper.parentElement?.offsetHeight || 0;
          
          if (w > 50 && h > 50) { // Dès que la taille est réaliste (plus grande que 50px)
            canvas.width = w;
            canvas.height = h;
            logger.log(`🎯 Taille du tableau ENFIN ajustée : ${w}x${h}`);
            
            if (window.WhiteboardService && window.WhiteboardService._canvas) {
              window.WhiteboardService._canvas.redraw();
            }
            
            clearInterval(resizeInterval); // Mission accomplie, on arrête la boucle
          }
        }
        
        // Sécurité : on arrête au bout de 5 secondes (50 tentatives) pour ne pas tourner à l'infini
        attempts++;
        if (attempts > 50) { 
          clearInterval(resizeInterval);
          logger.warn("⚠️ Impossible de mesurer la vue, fallback appliqué.");
          // Fallback brutal au cas où
          if (canvas) { canvas.width = 800; canvas.height = 600; }
        }
      }, 100); // 100 ms d'intervalle
    });
    
    // 📡 ABONNEMENT 🕒 on peut aussi faire ça dans initSession, mais comme ça c'est sûr que c'est prêt avant tout signal
    // ✅ SESSION PRÊTE 🕒 les deux pairs sont dans la room
    // C'est ici que WebRTC démarre, pas au match
    eventBus.on("student:session-ready", async ({ initiator }) => {
      logger.log("🧠 Session prête 🕒 démarrage WebRTC, initiateur :", initiator);
      await EtudiantSessionOrchestrator._startWebRTC(initiator);
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
    // FIX : "student:user-left" 🕒 nom exact 🕒 émis par socket.handler.etudiant.js
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
  // Ordre critique :
  //   1. create()
  //   2. callbacks (onTrack AVANT addLocalStream)
  //   3. getUserMedia + addLocalStream  ← AVANT flush/offer
  //   4. DataChannel
  //   5. flush pendingSignals
  //   6. createOffer si initiateur
  // ====================================================

 async _startWebRTC(isInitiator) {
  logger.log("🧠 Démarrage WebRTC ― initiateur :", isInitiator);

  const config = await loadWebRTCConfig(AppState.token);

  peer = new PeerConnection({ config });
  peer.create();

  // ✅ Un seul handler — peer.onTrack uniquement
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

  // 🕒 2. MEDIA LOCAL (AVANT flush et offer)
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
    // 🕒 3. DATACHANNEL 🕒
    DataChannelService.init(peer.getPC(), isInitiator, {
      onChat: (text) => {
          // On récupère dynamiquement le nom du partenaire stocké lors du matching
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
     // 🕒 AJOUT
      onDrawReady: () => {
       logger.log("✅ Channel draw prêt ― envoi fichier autorisé");
       eventBus.emit("file:channel-ready");
        },
       });

    // 🕒 4. FLUSH signaux en attente 🕒
    if (pendingSignals.length > 0) {
      logger.log(`🧠 Flush ${pendingSignals.length} signaux en attente`);
      for (const signal of pendingSignals) {
        await this._handleSignal(signal);
      }
      pendingSignals = [];
    }

    // 🕒 5. OFFRE SDP (initiateur uniquement) 🕒
    if (isInitiator) {
      try {
        // Options de repli si pas de caméra, sinon négociation classique
        const offerOptions = {
          offerToReceiveAudio: true,
          offerToReceiveVideo: true
        };

        // On laisse ton wrapper "peer" créer l'offre comme il le faisait à l'origine
        const offer = await peer.createOffer(offerOptions);
        
        // ❌ SUPPRESSION DE peer.setLocalDescription qui faisait planter le script
        
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
  // PeerConnection.addIceCandidate gère sa queue interne ­
  // pas besoin de pendingCandidates ici
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
        // ICE queue flushée automatiquement dans PeerConnection.setRemoteDescription

      } else if (signal.type === "answer") {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        // ICE queue flushée automatiquement dans PeerConnection.setRemoteDescription

      } else if (signal.type === "ice-candidate") {
        // PeerConnection.addIceCandidate gère la queue si remoteDescription absent
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
  if (this._screenStream) return; // déjà en cours
  if (!peer) { logger.warn("⚠️ Pas de peer actif"); return; }

  try {
    // 1. Capturer l'écran
    this._screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });

    this._screenTrack = this._screenStream.getVideoTracks()[0];
    if (!this._screenTrack) throw new Error("Pas de piste vidéo écran");

    // 2. Ajouter la track à la PeerConnection
    this._screenSender = peer.getPC().addTrack(
      this._screenTrack,
      this._screenStream
    );

    // 3. Renégociation SDP
    const offer = await peer.createOffer();
    EtudiantSessionService.sendSignal({ type: "offer", sdp: offer.sdp });

    // 4. Arrêt auto si l'utilisateur ferme via le navigateur
    this._screenTrack.onended = () => this.stopScreenShare();

    // 5. Notifier l'UI
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

  // 1. Retirer la track de la PeerConnection
  if (peer && this._screenSender) {
    try { peer.getPC().removeTrack(this._screenSender); } catch {}
  }
  // 2. Renégociation SDP
  if (peer) {
    try {
      const offer = await peer.createOffer();
      EtudiantSessionService.sendSignal({ type: "offer", sdp: offer.sdp });
    } catch {}
  }

  // 3. Notifier l'UI
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

  // ✅ 1. Nettoyer l'écran partagé EN PREMIER — sans émettre screenshare:stopped
  this._cleanupScreenShare?.();

  // ✅ 2. Détruire le peer UNE SEULE FOIS
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

  // ✅ 3. Émettre les events EN DERNIER
  eventBus.emit("screenshare:stopped");
  eventBus.emit("session:reset", { reason });
  }
};