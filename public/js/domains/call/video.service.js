import { CallStateMachine } from "./call.state.machine.js";

export const VideoService = {
  room: null,

  async connect(token) {
    console.log("?? Tentative de connexion vidéo...");
    try {
      this.room = await Twilio.Video.connect(token, { audio: true, video: { width: 640 } });
      console.log("? Connecté à Twilio Room:", this.room.name);

      this.room.localParticipant.tracks.forEach(publication => {
        if (publication.track) this.attachTrack(publication.track, "local");
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

      this.room.on("disconnected", () => {
        CallStateMachine.setState(CallStateMachine.STATES.ENDED);
      });

    } catch (e) { console.error("? Erreur VideoService:", e); }
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

    console.log("?? Flux attaché à:", containerId);

    if (track.kind === "audio") {
      const el = track.attach();
      el.autoplay = true;
      document.body.appendChild(el);
      return;
    }
    if (container.tagName === "VIDEO") {
      const newEl = track.attach();
      newEl.autoplay = true;
      newEl.playsInline = true;
      newEl.muted = (side === "local");
      newEl.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.replaceWith(newEl);
      newEl.id = containerId;
    } else {
      const existing = container.querySelector("video");
      if (existing) existing.remove();
      const el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      el.muted = (side === "local");
      el.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.appendChild(el);
    }
  },

  disconnect() {
    if (this.room) {
      this.room.localParticipant.tracks.forEach(pub => {
        if (pub.track) { pub.track.stop(); pub.unpublish(); }
      });
      this.room.disconnect();
      this.room = null;
    }
    CallStateMachine.setState(CallStateMachine.STATES.ENDED);
  }
};
