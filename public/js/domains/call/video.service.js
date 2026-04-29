import { CallStateMachine } from "./call.state.machine.js";

export const VideoService = {
  room: null,

  async connect(token) {
    try {
      this.room = await Twilio.Video.connect(token, { audio: true, video: { width: 640 } });
      console.log("✅ Connecté à Twilio Room:", this.room.name);

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
      this.room.on("disconnected", () => {
        if (!this._silentDisconnect) {
          CallStateMachine.setState(CallStateMachine.STATES.ENDED);
        }
        this._silentDisconnect = false; 
        
      });
      
} catch (e) {
    console.error("❌ Erreur VideoService:", e);
    }
  },

  // ✅ Déconnexion normale (déclenche l'event "disconnected" → setState ended)
  disconnect() {
    if (!this.room) return;
    this._stopLocalTracks();
    this.room.disconnect(); // → déclenche "disconnected" → CallStateMachine.setState(ENDED)
    this.room = null;
    CallStateMachine.setState(CallStateMachine.STATES.ENDED); // ← SUPPRIMÉ (doublon)
  },

  // ✅ Déconnexion silencieuse : n'appelle PAS setState (appelée par terminateCall)
  disconnectSilent() {
    if (!this.room) return;
    this._silentDisconnect = true; // flag pour bloquer le handler "disconnected"
    this._stopLocalTracks();
    this.room.disconnect();
    this.room = null;
  },

  _stopLocalTracks() {
    this.room?.localParticipant?.tracks?.forEach(pub => {
      pub.track?.stop();
      pub.unpublish?.();
    });
  },

  attachTrack(track, side, attempts = 0) {
    if (track.kind !== "video" && track.kind !== "audio") return;

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
  }
};