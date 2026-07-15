// ======================================================
// 🎓 ETUDIANT SESSION ORCHESTRATOR
// // CERVEAU GLOBAL (Matching + WebRTC + DataChannel)
// ======================================================
import { AppState }         from "/js/core/state.js";
import { eventBus }          from "/js/core/eventBus.js";
import { Logger as logger } from "/js/lib/logger.js";
import { socketService }     from "/js/core/socket.service.js";
import { refreshAccessToken } from "/js/lib/auth.refresh.js";
import { handleStudentSocketMessage } from "/js/core/socket.handler.etudiant.js";
import { initEtudiantSessionEvents }  from "./etudiant.session.events.js";
import { EtudiantSessionService }     from "./etudiant.session.service.js";
import { EtudiantMatchingService }    from "./etudiant.matching.service.js";
import { StudentSessionStorage } from "/js/domains/etudiant-session/student.session.storage.js";
import { PeerConnection }     from "/js/webrtc/peer.connection.js";
import { DataChannelService } from "/js/domains/webrtc/datachannel.service.js";
import { loadWebRTCConfig }   from "/js/webrtc/webrtc.config.js";

// ======================================================
// STATE
// ======================================================

let peer           = null;
let localStream    = null;
let iceRestartTimeout = null;
let pendingReconnectPartner = null;
let pendingSignals = [];
let iceQueue       = [];
let isInitialized  = false; 
let unsubscribeMessage = null;
let canvasResizeInterval = null;

export const EtudiantSessionOrchestrator = {

  init(uiInterface = null) {
    if (isInitialized) {
      logger.warn("⚠️ Orchestrator déjà initialisé — appel ignoré");
      return;
    }
    isInitialized = true;

    logger.log("🧠 Orchestrator étudiant initialisé");
    EtudiantSessionService.init();
    EtudiantMatchingService.init();

    socketService.setAuthExpiredHandler(async () => {
      const ok = await refreshAccessToken();
      if (!ok) return null;
      const token = localStorage.getItem("token");
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      return `${protocol}://${location.host}/ws?token=${token}`;
    });

    // 👈 on garde la référence de désinscription, comme le fait déjà socket.handler.eleve.js
    if (unsubscribeMessage) unsubscribeMessage();
    unsubscribeMessage = socketService.onMessage(handleStudentSocketMessage);

    initEtudiantSessionEvents({
      matchingService: EtudiantMatchingService,
      sessionService:  EtudiantSessionService,
      webrtcService:   this,
      uiService:       uiInterface,
    });

    this._bindEvents();

    const token = AppState.token || localStorage.getItem("token");
    if (token) {
      const protocol = location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${location.host}/ws?token=${token}`;
      socketService.connect(wsUrl); // déjà protégé côté socket.service (readyState check)
      logger.log("🔌 WebSocket connecté depuis l'orchestrateur");
    } else {
      logger.warn("⚠️ Pas de token — WebSocket non connecté");
    }
  },
  // ====================================================
  // DESTROY  👈 NOUVELLE MÉTHODE — collée ici
  // ====================================================
  destroy() {
    logger.log("🧹 Destruction orchestrator étudiant");
    if (unsubscribeMessage) {
      unsubscribeMessage();
      unsubscribeMessage = null;
    }
    this._cleanup({ reason: "destroy" });
    isInitialized      = false;
    this._eventsBound  = false;
    // Note: eventBus.on() n'a pas d'unsubscribe stocké ici —
    // si un vrai destroy/reinit doit être supporté, il faudra
    // migrer vers eventBus.on() avec off() explicite.
  },
  // ====================================================
  // EVENTS
  // ====================================================
 _bindEvents() {
    if (this._eventsBound) {
      logger.warn("⚠️ _bindEvents déjà appelée — ignorée");
      return;
    }
    this._eventsBound = true;

// 1️⃣ MATCH TROUVÉ → démarre la session (état) + demande le join room.
//    Ne connaît pas encore le rôle d'initiateur : ce n'est pas sa responsabilité.
eventBus.on("student:match-found", ({ roomId }) => {
  logger.log(`🎯 Match trouvé ! Initialisation de la room : ${roomId}`);

  AppState.startSession({ roomId });
  EtudiantSessionService.joinRoom(roomId); // 🟡 MODIFIÉ (au lieu de socketService.send direct)
  logger.log("🚪 Signal student:joinRoom envoyé de manière centralisée");
   
  // Sécurité : On nettoie un éventuel intervalle précédent
      if (canvasResizeInterval) clearInterval(canvasResizeInterval);
  // Le canvas peut être dimensionné dès que la vue session s'affiche,
  // indépendamment de l'état de la connexion WebRTC.
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
        canvasResizeInterval = null;
      }
    }

    attempts++;
    if (attempts > 50) {
      clearInterval(canvasResizeInterval);
      canvasResizeInterval = null;
      logger.warn("⚠️ Impossible de mesurer la vue, fallback appliqué.");
      if (canvas) { canvas.width = 800; canvas.height = 600; }
    }
  }, 100);
});

// 2️⃣ SESSION PRÊTE (confirmée serveur) → seule source de vérité pour l'initiateur,
//    seule responsable du démarrage effectif de WebRTC.
eventBus.on("student:session-ready", async ({ initiator }) => {
  logger.log(`🧠 Session confirmée par le serveur, lancement WebRTC (Initiateur: ${initiator})`);
  await EtudiantSessionOrchestrator._startWebRTC(initiator);
});

// 3️⃣ IDENTIFY → envoyé dès l'ouverture du socket, sans délai artificiel,
//    pour minimiser la fenêtre de course avec un enqueue prématuré.
eventBus.on("socket:open", () => {
  console.log("C - socket:open");
  const user = AppState.currentUser;
  
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
});
    
// ✅ COLLER ICI — Détecter si l'étudiant arrive via un lien d'invitation
const params = new URLSearchParams(window.location.search);
const inviteId = params.get("invite");

if (inviteId) {
    logger.log("🔗 Invitation détectée — userId invitant :", inviteId);
    AppState.pendingInviteId = inviteId;
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
     
    // 🟢 AJOUT — Reconnexion : notre propre client revient après une coupure
  eventBus.on("student:attempt-reconnect", ({ roomId, partner }) => {
  logger.log("🔄 Tentative de reconnexion à la room :", roomId);
  pendingReconnectPartner = partner || null;
  AppState.startSession({ roomId });
  EtudiantSessionService.joinRoom(roomId);
});

eventBus.on("file:error", ({ name }) => {
    const attachmentPreview = document.getElementById("attachment-preview");
    if (attachmentPreview) {
        attachmentPreview.innerHTML = `<div class="attachment-item">❌ Échec de l'envoi : ${name} — réessayez</div>`;
    }
});
// 🟢 AJOUT — Le PARTENAIRE vient de se déconnecter (grâce en cours côté serveur)
eventBus.on("student:peer-disconnected", ({ userName, graceSeconds }) => {
  logger.log(`⏳ Partenaire déconnecté (${userName}) — grâce ${graceSeconds}s`);
  eventBus.emit("ui:callState", { state: "reconnecting", graceSeconds });
});

// 🟢 AJOUT — Le partenaire est revenu à temps
eventBus.on("student:peer-reconnected", ({ userName }) => {
  logger.log(`✅ Partenaire reconnecté (${userName})`);
  eventBus.emit("ui:callState", { state: "inCall" });
});
    // 💬 ÉCOUTEUR D'ENVOI DU CHAT LOCAL VIA WEBRTC
    eventBus.on("chat:send-local", (text) => {
      logger.log("🧠 Orchestrator : Envoi du message via DataChannel");
      this.sendChat(text); 
    });
    // 🟢 AJOUT — restaure l'UI (vue session, tableau blanc, badge) après un rechargement
eventBus.on("student:joined-room", ({ roomId, reconnected }) => {
  if (reconnected && pendingReconnectPartner) {
    logger.log("🎨 Restauration UI après reconnexion (partenaire :", pendingReconnectPartner.partnerName, ")");
    eventBus.emit("student:session-restored", {
      roomId,
      partnerName: pendingReconnectPartner.partnerName,
      partnerVille: pendingReconnectPartner.partnerVille,
      partnerPays: pendingReconnectPartner.partnerPays,
    });
    pendingReconnectPartner = null; // consommé, on nettoie
  }
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
    let hasTriggeredPrimaryStream = false; // Variable locale au scope pour flagguer le premier stream principal

    peer.onTrack((stream, track) => {
      const videoReceivers = peer.getPC()
        .getReceivers()
        .filter(r => r.track?.kind === "video" && r.track.readyState === "live");

      logger.log(`🧠 Flux distant reçu (${track.kind}) — videoReceivers: ${videoReceivers.length}`);

      if (videoReceivers.length > 1) {
        logger.log("📺 Track écran partagé reçue");
        eventBus.emit("screenshare:remote-stream", stream);
      } else {
        // 🛡️ SÉCURITÉ ANTI-DOUBLON : On ne laisse passer que la piste vidéo principale.
        // Si c'est la piste audio qui arrive en premier ou en second, elle est ignorée ici
        // car l'objet 'stream' contient déjà l'audio et la vidéo regroupés.
        if (track.kind === "video") {
          if (hasTriggeredPrimaryStream) {
            logger.log("📡 Flux vidéo principal déjà reçu, événement ignoré pour éviter les doublons UI.");
            return;
          }
          hasTriggeredPrimaryStream = true;
          eventBus.emit("media:remote-stream", stream);
        }
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

  if (state === "disconnected") {
    // 🟢 AJOUT — tentative de récupération légère avant de tout démonter
    logger.log("⚠️ ICE déconnecté — tentative d'ICE restart avant abandon complet");
    EtudiantSessionOrchestrator._tryIceRestart();
  }

  if (state === "failed") {
    // Échec net et confirmé → pas la peine d'attendre, on démonte direct
    logger.log("❌ Connexion définitivement échouée — démontage du peer");
    clearTimeout(iceRestartTimeout);
    this._teardownPeer();
    eventBus.emit("ui:callState", { state: "reconnecting" });
  }

  if (state === "connected") {
    // 🟢 AJOUT — la connexion est rétablie (via ICE restart ou normalement) :
    // annule tout timeout de fallback en attente
    clearTimeout(iceRestartTimeout);
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
      onFileSent: (fileInfo) => eventBus.emit("file:sent", fileInfo),
      onFileProgress: (id, progress)   => eventBus.emit("file:progress",     { id, progress }),
      onFileMeta:     (meta)           => eventBus.emit("file:meta",         meta),
      onFileEnd:      (meta)           => eventBus.emit("file:end",          meta),
     onFileError: ({ name, reason }) => eventBus.emit("file:error", { name, reason }),
      onDrawReady: () => {
        logger.log("✅ Channel draw prêt ― envoi fichier autorisé");
        eventBus.emit("file:channel-ready");
      },
      onDrawClosed: () => {                                   // 🟢 AJOUT
  logger.log("⚠️ Channel draw fermé ― envoi fichier bloqué");
  eventBus.emit("file:channel-closed");
},
      onChatReady: () => {                                    // 🟢 AJOUT
    logger.log("✅ Channel chat prêt ― chat autorisé");
    eventBus.emit("chat:channel-ready");
  },
  onChatClosed: () => {                                   // 🟢 AJOUT
  logger.log("⚠️ Channel chat fermé ― chat bloqué");
  eventBus.emit("chat:channel-closed");
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
    
    // Essayer d'abord d'envoyer par le DataChannel RTC
    const dcReady = DataChannelService.isChatReady?.() || false; // Vérifie la dispo réelle
    
    if (dcReady) {
      logger.log("💬 Envoi du message via WebRTC DataChannel");
      DataChannelService.sendChat(text);
    } else {
      // Fallback sécurisé par WebSocket (notre socketService gère déjà le JSON.stringify !)
      logger.log("📡 WebRTC non dispo, envoi du message via WebSocket (Fallback)");
      const roomId = AppState.currentRoomId;
      if (roomId) {
        socketService.send({
          type: "student:chatMessage",
          text: text,
          roomId: roomId
        });
      } else {
        logger.warn("⚠️ Impossible d'envoyer le message : aucune room active");
      }
    }
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
    if (!peer) { 
      logger.warn("⚠️ Pas de peer actif"); 
      return; 
    }
    if (AppState.whiteboardOnly) {
      logger.warn("⚠️ Mode tableau blanc seul ― partage d'écran désactivé (pas de renégociation).");
      return;
    }

    const pc = peer.getPC();
    if (!pc || pc.signalingState !== "stable") {
      logger.warn("⚠️ Renégociation déjà en cours — partage d'écran annulé, réessayez dans un instant.");
      return;
    }

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

    if (AppState.whiteboardOnly) {
      logger.log("ℹ️ Mode tableau blanc seul ― arrêt écran sans renégociation.");
    } else {
      const pc = peer?.getPC();
if (!pc || pc.signalingState !== "stable") {
  logger.warn("⚠️ Renégociation ignorée — SDP instable.");
  return;
}
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
// 🟢 AJOUT — ICE RESTART (récupération légère avant teardown complet)
// Sur un simple "disconnected" (souvent transitoire), on tente d'abord
// de relancer la négociation ICE sans détruire le peer ni les DataChannels.
// Si ça n'aboutit pas dans le délai, on bascule sur le teardown complet
// (qui déclenchera la grâce serveur classique).
// ====================================================
async _tryIceRestart() {
  if (!peer) return;
  if (AppState.whiteboardOnly) {
    logger.log("ℹ️ ICE restart ignoré en mode tableau blanc seul (pas de renégociation).");
    return;
  }
  clearTimeout(iceRestartTimeout);

  try {
    // >>> REMPLACER LE BLOC DE TRY PAR CELUI-CI <<<
    if (peer && typeof peer.restartIce === "function") {
      const offer = await peer.restartIce();
      if (offer) {
        EtudiantSessionService.sendSignal({ type: "offer", sdp: offer.sdp });
        logger.log("🔄 Offer de renégociation ICE envoyée");
      }
    }
  } catch (err) {
    logger.error("❌ Échec ICE restart :", err);
  }

  // Filet de sécurité : si l'état n'est pas redevenu "connected" dans
  // ce délai, on abandonne l'ICE restart et on passe au teardown complet.
  iceRestartTimeout = setTimeout(() => {
    if (peer && peer.getState() !== "connected") {
      logger.warn("⏱️ ICE restart sans succès après délai — démontage complet");
      this._teardownPeer();
      eventBus.emit("ui:callState", { state: "reconnecting" });
    }
  }, 5000); // 🟢 5 secondes de tolérance, ajustable
},
  // ====================================================
// 🟢 AJOUT — TEARDOWN LÉGER (reconnexion possible)
// Contrairement à _cleanup(), ne touche PAS à AppState.currentRoomId
// ni à StudentSessionStorage : la session reste "vivante" en attente
// d'une reconnexion (soit la nôtre, soit celle du partenaire).
// ====================================================
_teardownPeer() {
  logger.log("🔌 Démontage du peer WebRTC (reconnexion possible)");
 clearTimeout(iceRestartTimeout);
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

  eventBus.emit("media:local-stream", null); // coupe l'aperçu vidéo local côté UI
},
  // ====================================================
  // CLEANUP
  // ====================================================

  _cleanup({ reason } = {}) {
    logger.log("🧹 Cleanup orchestrator :", reason);

    this._cleanupScreenShare?.();

    if (canvasResizeInterval) {
    clearInterval(canvasResizeInterval);
    canvasResizeInterval = null;
  }

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

    StudentSessionStorage.clear(); // 🟢 AJOUT : fin définitive → plus rien à reconnecter

    // 🟢 AJOUT : cleanup AppState
  AppState.endSession();          // remet sessionInProgress=false + currentRoomId=null
  AppState.partnerName = null;    // supprime le partenaire affiché
  AppState.currentCall = null;    // débloque le bouton d’appel

  // 🟢 UI → retour à l’état normal
    eventBus.emit("ui:callState", { state: "idle" });
    eventBus.emit("screenshare:stopped");
    eventBus.emit("session:reset", { reason });
}
};