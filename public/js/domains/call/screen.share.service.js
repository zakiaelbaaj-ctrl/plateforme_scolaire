// ======================================================
// SCREEN SHARE SERVICE
// /js/domains/call/screen.share.service.js
// ======================================================
import { socketService } from "/js/core/socket.service.js";
import { AppState }      from "/js/core/state.js";

export const ScreenShareService = {

  _track:     null, // LocalVideoTrack Twilio
  _stream:    null, // MediaStream natif
  _sharing:   false,
  _callbacks: { onStart: null, onStop: null },

  onStart(cb) { this._callbacks.onStart = cb; },
  onStop(cb)  { this._callbacks.onStop  = cb; },

  isSharing() { return this._sharing; },

  async start(twilioRoom) {
    if (this._sharing) return;
    if (!twilioRoom) {
      console.warn("⚠️ ScreenShare: pas de room Twilio active");
      return;
    }

    try {
      // 1. Capturer l'écran
      this._stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: false
      });

      const videoTrack = this._stream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("Pas de piste vidéo");

      // 2. Créer une LocalVideoTrack Twilio
      const { LocalVideoTrack } = Twilio.Video;
      this._track = new LocalVideoTrack(videoTrack, { name: "screen" });

      // 3. Publier dans la room Twilio
      await twilioRoom.localParticipant.publishTrack(this._track);

      // 4. Notifier le serveur
      socketService.send({
        type:     "screenShareStart",
        roomId:   AppState.currentRoomId,
        streamId: this._track.name
      });

      this._sharing = true;
      this._callbacks.onStart?.(this._track);

      // 5. Arrêt automatique si l'utilisateur ferme le partage via le navigateur
      videoTrack.onended = () => this.stop(twilioRoom);

      console.log("📺 Partage d'écran démarré");

    } catch (err) {
      if (err.name !== "NotAllowedError") {
        console.error("❌ ScreenShare error:", err);
      }
      this._cleanup();
    }
  },

  async stop(twilioRoom) {
    if (!this._sharing) return;

    // 1. Dépublier de Twilio
    if (twilioRoom && this._track) {
      try {
        await twilioRoom.localParticipant.unpublishTrack(this._track);
      } catch {}
    }

    // 2. Notifier le serveur
    socketService.send({
      type:   "screenShareStop",
      roomId: AppState.currentRoomId
    });

    this._callbacks.onStop?.();
    this._cleanup();
    console.log("📺 Partage d'écran arrêté");
  },

  _cleanup() {
    this._track?.stop?.();
    this._stream?.getTracks().forEach(t => t.stop());
    this._track   = null;
    this._stream  = null;
    this._sharing = false;
  }
};