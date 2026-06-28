import { CallStateMachine } from "./call.state.machine.js";
import { AppState } from "/js/core/state.js";
import { socketService } from "/js/core/socket.service.js"; 
export const VideoService = {
  room: null,

 async connect(token) {
    try {
      const { Logger } = Twilio.Video;
Logger.setDefaultLevel("warn"); // ✅ nouvelle API
this.room = await Twilio.Video.connect(token, { 
  audio: true, 
  video: { width: 640 },
  networkQuality: {
    local: 1,   // ✅ détecte la qualité réseau locale
    remote: 1   // ✅ détecte la qualité réseau distante
  },
  bandwidthProfile: {
    video: {
      mode: 'collaboration',  // ✅ optimisé pour 2 participants
      maxTracks: 2,
      renderDimensions: {
        high: { width: 640, height: 480 }
      }
    }
  },
  preferredVideoCodecs: [{ codec: 'VP8', simulcast: false }],
  maxAudioBitrate: 16000
});
      this._reconnectAttempts = 0;

      this.room.localParticipant.tracks.forEach(pub => {
        if (pub.track) this.attachTrack(pub.track, "local");
      });

      this.room.participants.forEach(participant => {
        participant.tracks.forEach(pub => {
          if (pub.isSubscribed && pub.track) this.attachTrack(pub.track, "remote");
        });
        participant.on("trackSubscribed", track => this.attachTrack(track, "remote"));
      });

      this.room.on("participantConnected", p => {
        p.on("trackSubscribed", track => this.attachTrack(track, "remote"));
      });

      // ✅ Twilio déclenche "disconnected" → on setState ended UNE SEULE FOIS
      // mais seulement si ce n'est pas nous qui avons initié la déconnexion
     this.room.on("disconnected", (room, error) => {
  if (this._silentDisconnect) {
    this._silentDisconnect = false;
    return; // déconnexion volontaire → on ne fait rien
  }

  // Coupure réseau temporaire → on tente de reconnecter
  if (error && error.code === 53001) {
    // 53001 = Room not found (token expiré ou room fermée côté serveur)
    // → pas de reconnect possible, on termine
    CallStateMachine.setState(CallStateMachine.STATES.ENDED);
    return;
  }
    // Autre coupure (réseau, ERR_CONNECTION_RESET) → demander un nouveau token
  console.warn("⚠️ Twilio déconnecté inopinément, demande de reconnexion...");
  this._requestNewToken();
}); 
    } catch (e) {
      console.error("❌ Erreur VideoService:", e);
    }
  },
  // Demande un nouveau token au serveur et reconnecte
_requestNewToken() {
  if (!AppState.currentRoomId) {
    console.warn("⚠️ Pas de roomId, reconnexion Twilio annulée");
    return;
  }

  // Limite : pas plus de 3 tentatives
  this._reconnectAttempts = (this._reconnectAttempts ?? 0) + 1;
  if (this._reconnectAttempts > 3) {
    console.error("❌ Trop de tentatives Twilio, on termine l'appel");
    this._reconnectAttempts = 0;
    CallStateMachine.setState(CallStateMachine.STATES.ENDED);
    return;
  }

  console.log(`🔄 Tentative Twilio #${this._reconnectAttempts}...`);

  // Demander un nouveau token via WS → le serveur répondra avec "twilioToken"
  // → CallService.handleEvent("twilioToken") → VideoService.connect(newToken)
  socketService.send({
    type: "requestTwilioToken",
    roomId: AppState.currentRoomId
  });
},
  // ✅ Déconnexion normale (déclenche l'event "disconnected" → setState ended)
  disconnect() {
    if (!this.room) return;
    this._stopLocalTracks();
    this.room.disconnect(); // → déclenche "disconnected" → CallStateMachine.setState(ENDED)
    this.room = null;
  },

  // ✅ Déconnexion silencieuse : n'appelle PAS setState (appelée par terminateCall)
  disconnectSilent() {
    if (!this.room) return;
    this._silentDisconnect = true; // flag pour bloquer le handler "disconnected"
    this._stopLocalTracks();
    this.room.disconnect();
    this.room = null;
  },

 // ✅ Après
_stopLocalTracks() {
  this.room?.localParticipant?.tracks?.forEach(pub => {
    pub.track?.stop();
    pub.unpublish?.();

    // ✅ Détache tous les éléments DOM liés à ce track
    pub.track?.detach?.().forEach(el => {
      el.srcObject = null;
      el.remove();
    });
  });

  // ✅ Vide aussi les containers vidéo directement
  ["localVideo", "localVideoContainer"].forEach(id => {
    const el = document.getElementById(id);
    if (el?.tagName === "VIDEO") {
      el.srcObject = null;
      el.pause?.();
    }
  });

  ["remoteVideo", "remoteVideoContainer"].forEach(id => {
    const el = document.getElementById(id);
    if (el?.tagName === "VIDEO") {
      el.srcObject = null;
      el.pause?.();
    }
  });
},

  attachTrack(track, side, attempts = 0) {
    if (track.kind !== "video" && track.kind !== "audio") return;
   // ✅ Track d'écran partagé → fenêtre flottante
  if (track.name === "screen" && side === "remote") {
    import("/js/ui/components/screen.share.overlay.js").then(({ ScreenShareOverlay }) => {
      ScreenShareOverlay.show(track);
      // Fermer overlay quand la track s'arrête
      track.on?.("stopped", () => ScreenShareOverlay.hide());
    });
    return;
  }
    const containerId = side === "local"
      ? (document.getElementById("localVideoContainer") ? "localVideoContainer" : "localVideo")
      : (document.getElementById("remoteVideoContainer") ? "remoteVideoContainer" : "remoteVideo");

    const container = document.getElementById(containerId);

    if (!container) {
      if (attempts < 10) setTimeout(() => this.attachTrack(track, side, attempts + 1), 500);
      return;
    }

    if (track.kind === "audio") {
      const el = track.attach();
      el.autoplay = true;
      document.body.appendChild(el);
      return;
    }

    if (container.tagName === "VIDEO") {
      const el = track.attach();
      el.autoplay = true; el.playsInline = true;
      el.muted = (side === "local");
      el.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.replaceWith(el);
      el.id = containerId;
    } else {
      container.querySelector("video")?.remove();
      const el = track.attach();
      el.autoplay = true; el.playsInline = true;
      el.muted = (side === "local");
      el.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.appendChild(el);
    }
    // ✅ AJOUT ICI — émettre le track vers dashboard.js
    if (side === "remote" && track.kind === "video") {
      AppState._notify("video:remoteTracks", [track]);
    }
    if (side === "local" && track.kind === "video") {
      AppState._notify("video:localTrack", [track]);
    }
  }
};
