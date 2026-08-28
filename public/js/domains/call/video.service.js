import { Room, RoomEvent, Track } from "livekit-client";
import { CallStateMachine } from "./call.state.machine.js";
import { AppState } from "/js/core/state.js";
import { socketService } from "/js/core/socket.service.js";

export const VideoService = {
  room: null,
  _reconnectAttempts: 0,
  _silentDisconnect: false,

  // ⚠️ Signature changée : LiveKit a besoin de l'URL du serveur, pas seulement du token
  async connect(token, url) {
    try {
      // ✅ NOUVEAU — nettoie proprement toute connexion LiveKit précédente
      // avant d'en établir une nouvelle. Sans ça, sur iOS Safari en particulier,
      // les anciens tracks caméra/micro peuvent rester "accrochés" et bloquer
      // la nouvelle acquisition média après une reconnexion.
      if (this.room) {
        console.log("🔄 Nettoyage de l'ancienne connexion LiveKit avant reconnexion");
        this._silentDisconnect = true;
        this._stopLocalTracks();
        try {
          await this.room.disconnect();
        } catch (e) {
          console.warn("⚠️ Erreur lors de la déconnexion de l'ancienne room:", e.message);
        }
        this.room = null;
      }
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: { resolution: { width: 640, height: 480 } },
      });

      // 1️⃣ Écouteurs AVANT connexion (recommandé par LiveKit)
      this.room
        .on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          this.attachTrack(track, "remote");
        })
        .on(RoomEvent.LocalTrackPublished, (publication) => {
          if (publication.track) this.attachTrack(publication.track, "local");
        })
        .on(RoomEvent.Disconnected, (reason) => {
          if (this._silentDisconnect) {
            this._silentDisconnect = false;
            return;
          }

          // reason "ROOM_DELETED" / "PARTICIPANT_REMOVED" ≈ ton ancien code Twilio 53001
          if (reason === "ROOM_DELETED" || reason === "PARTICIPANT_REMOVED") {
            CallStateMachine.setState(CallStateMachine.STATES.ENDED);
            return;
          }

          console.warn("⚠️ LiveKit déconnecté inopinément, demande de reconnexion...");
          this._requestNewToken();
        });

      // 2️⃣ Connexion (LiveKit gère la reconnexion réseau automatiquement en interne)
      await this.room.connect(url, token);

      // 3️⃣ Acquisition + publication caméra/micro avec secours audio-only
      try {
        await this.room.localParticipant.enableCameraAndMicrophone();
      } catch (mediaError) {
        console.warn("⚠️ Échec Caméra + Micro. Tentative Audio uniquement...", mediaError);
        try {
          await this.room.localParticipant.setMicrophoneEnabled(true);
        } catch (audioError) {
          console.error("❌ Échec total de la capture média local :", audioError);
        }
      }

      this._reconnectAttempts = 0;

      // 4️⃣ Participants déjà présents dans la room au moment du join
      this.room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub) => {
          if (pub.isSubscribed && pub.track) this.attachTrack(pub.track, "remote");
        });
      });

    } catch (e) {
      console.error("❌ Erreur VideoService:", e);
    }
  },

  _requestNewToken() {
    if (!AppState.currentRoomId) {
      console.warn("⚠️ Pas de roomId, reconnexion LiveKit annulée");
      return;
    }

    this._reconnectAttempts = (this._reconnectAttempts ?? 0) + 1;
    if (this._reconnectAttempts > 3) {
      console.error("❌ Trop de tentatives LiveKit, on termine l'appel");
      this._reconnectAttempts = 0;
      CallStateMachine.setState(CallStateMachine.STATES.ENDED);
      return;
    }

    console.log(`🔄 Tentative LiveKit #${this._reconnectAttempts}...`);

    socketService.send({
      type: "requestLiveKitToken", // ⚠️ à renommer aussi côté serveur si utilisé
      roomId: AppState.currentRoomId
    });
  },

  disconnect() {
    if (!this.room) return;
    this._stopLocalTracks();
    this.room.disconnect();
    this.room = null;
    CallStateMachine.setState(CallStateMachine.STATES.ENDED);
  },

  disconnectSilent() {
    if (!this.room) return;
    this._silentDisconnect = true;
    this._stopLocalTracks();
    this.room.disconnect();
    this.room = null;
  },

  _stopLocalTracks() {
    this.room?.localParticipant?.trackPublications?.forEach((pub) => {
      pub.track?.stop();
      this.room.localParticipant.unpublishTrack(pub.track);

      pub.track?.detach?.().forEach((el) => {
        el.srcObject = null;
        el.remove();
      });
    });

    ["localVideo", "localVideoContainer"].forEach((id) => {
      const el = document.getElementById(id);
      if (el?.tagName === "VIDEO") {
        el.srcObject = null;
        el.pause?.();
      }
    });

    ["remoteVideo", "remoteVideoContainer"].forEach((id) => {
      const el = document.getElementById(id);
      if (el?.tagName === "VIDEO") {
        el.srcObject = null;
        el.pause?.();
      }
    });
  },

  attachTrack(track, side, attempts = 0) {
    if (track.kind !== Track.Kind.Video && track.kind !== Track.Kind.Audio) return;

    // ⚠️ Différence clé vs Twilio : la détection "écran partagé" se fait via track.source,
    // pas via track.name === "screen"
    if (track.source === Track.Source.ScreenShare && side === "remote") {
      import("/js/ui/components/screen.share.overlay.js").then(({ ScreenShareOverlay }) => {
        ScreenShareOverlay.show(track);
        track.on?.("ended", () => ScreenShareOverlay.hide());
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

    if (track.kind === Track.Kind.Audio) {
      if (side === "remote") {
         // ✅ NOUVEAU — retire les éléments audio distants précédents avant d'ajouter le nouveau
    document.querySelectorAll('audio[data-livekit-remote="true"]').forEach(el => {
      el.srcObject = null;
      el.remove();
    });
        const el = track.attach();
        el.autoplay = true;
        document.body.appendChild(el);
      }
      return;
    }

    if (container.tagName === "VIDEO") {
      const el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      el.muted = (side === "local");
      el.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.replaceWith(el);
      el.id = containerId;
    } else {
      container.querySelector("video")?.remove();
      const el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      el.muted = (side === "local");
      el.style.cssText = "width:100%;height:100%;object-fit:cover;";
      container.appendChild(el);
    }

    if (side === "remote" && track.kind === Track.Kind.Video) {
      AppState._notify("video:remoteTracks", [track]);
    }
    if (side === "local" && track.kind === Track.Kind.Video) {
      AppState._notify("video:localTrack", [track]);
    }
  }
};