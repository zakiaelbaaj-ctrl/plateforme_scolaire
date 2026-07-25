// ======================================================
// SCREEN SHARE SERVICE
// /js/domains/call/screen.share.service.js
// ======================================================
import { socketService } from "/js/core/socket.service.js";
import { AppState }      from "/js/core/state.js";

export const ScreenShareService = {

  _publication: null, // LocalTrackPublication LiveKit
  _sharing:     false,
  _callbacks:   { onStart: null, onStop: null },

  onStart(cb) { this._callbacks.onStart = cb; },
  onStop(cb)  { this._callbacks.onStop  = cb; },

  isSharing() { return this._sharing; },

  async start(room) {
    if (this._sharing) return;
    if (!room) {
      console.warn("⚠️ ScreenShare: pas de room LiveKit active");
      return;
    }

    try {
      // LiveKit gère nativement capture + création + publication du track
      this._publication = await room.localParticipant.setScreenShareEnabled(true, {
        audio: false
      });

      if (!this._publication?.track) {
        throw new Error("Échec de la publication du partage d'écran");
      }

      // Notifier le serveur
      socketService.send({
        type:     "screenShareStart",
        roomId:   AppState.currentRoomId,
        streamId: this._publication.trackSid
      });

      this._sharing = true;
      this._callbacks.onStart?.(this._publication.track);

      // Arrêt automatique si l'utilisateur ferme le partage via le navigateur
      const mediaTrack = this._publication.track.mediaStreamTrack;
      if (mediaTrack) {
        mediaTrack.onended = () => this.stop(room);
      }

      console.log("📺 Partage d'écran démarré");

    } catch (err) {
      if (err.name !== "NotAllowedError") {
        console.error("❌ ScreenShare error:", err);
      }
      this._cleanup(room);
    }
  },

  async stop(room) {
    if (!this._sharing) return;

    // Dépublier de LiveKit (setScreenShareEnabled(false) coupe la capture + dépublie)
    if (room) {
      try {
        await room.localParticipant.setScreenShareEnabled(false);
      } catch {}
    }

    // Notifier le serveur
    socketService.send({
      type:   "screenShareStop",
      roomId: AppState.currentRoomId
    });

    this._callbacks.onStop?.();
    this._cleanup();
    console.log("📺 Partage d'écran arrêté");
  },

  _cleanup() {
    this._publication = null;
    this._sharing = false;
  }
};