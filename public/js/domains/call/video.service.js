// ======================================================
// VIDEO DOMAIN SERVICE — TWILIO LOGIC
// ======================================================

import { AppState } from "/js/core/state.js";

// ✅ Callbacks vers CallService
const _cb = {
  localTrack:   null,
  remoteTracks: null,
  disconnected: null,
};

export const VideoService = {

  // ============================
  // ABONNEMENTS (enregistrés par CallService)
  // ============================

  onLocalTrack(cb)   { _cb.localTrack   = cb; },
  onRemoteTracks(cb) { _cb.remoteTracks = cb; },
  onDisconnected(cb) { _cb.disconnected = cb; },


  // ============================
  // CONNECT TO TWILIO ROOM
  // ============================

  async connect(token, roomName) {
    console.log("🔌 VideoService.connect appelé", { roomName });

    if (!window.Twilio?.Video) {
      console.error("❌ Twilio SDK non chargé");
      return null;
    }

    try {
      console.log("⏳ Twilio.Video.connect en cours...");

      const room = await window.Twilio.Video.connect(token, {
        name:  roomName,
        audio: true,
        video: true,
        networkQuality: true,      // ← ajouter
        reconnectOnNetworkError: true  // ← ajouter
      });

      console.log("✅ Twilio connecté, room:", room.name);

      AppState.twilioRoom = room;
      AppState.callState  = "inCall";

      // ✅ Émet les tracks locales immédiatement
      room.localParticipant.tracks.forEach(publication => {
        if (publication.track) {
          _cb.localTrack?.(publication.track);
        }
      });

      // ✅ Émet les tracks des participants déjà présents
      this._emitRemoteTracks(room);

      // ✅ Écoute les nouveaux participants
          // ✅ APRÈS — gère les participants déjà présents ET les nouveaux

// Participants déjà présents au moment de la connexion
room.participants.forEach(participant => {
  participant.on("trackSubscribed", () => {
    this._emitRemoteTracks(room);
  });

  // ✅ Tracks déjà publiées avant l'abonnement
  participant.tracks.forEach(publication => {
    if (publication.isSubscribed && publication.track) {
      this._emitRemoteTracks(room);
    }
  });
});

// Nouveaux participants qui arrivent après
room.on("participantConnected", participant => {
  participant.on("trackSubscribed", () => {
    this._emitRemoteTracks(room);
  });
});

      // ✅ Écoute les départs de participants
      room.on("participantDisconnected", () => {
        this._emitRemoteTracks(room);
      });

      // ✅ Écoute la déconnexion de la room
      // ✅ Après
room.on("disconnected", (room, error) => {
  AppState.twilioRoom = null;
  AppState.callState  = "idle";

  if (error) {
    console.warn("⚠️ Twilio déconnecté:", error.message);

    // Reconnexion automatique si déconnexion réseau
    if (error.code === 53001 || error.code === 53405) {
      console.log("🔄 Tentative de reconnexion Twilio...");
      setTimeout(() => {
        VideoService.connect(token, roomName);
      }, 2000);
      return;
    }
  }

  _cb.disconnected?.();
});

      return room;

    } catch (error) {
      console.error("❌ Erreur Twilio.Video.connect:", error);
      AppState.callState = "idle";
      return null;
    }
  },


  // ============================
  // DISCONNECT
  // ============================

  disconnect() {
    const room = AppState.twilioRoom;
    if (!room) return;

    // ✅ Arrête les tracks locales — éteint caméra et micro
    room.localParticipant.tracks.forEach(publication => {
      publication.track?.stop();
    });

    try {
      room.disconnect();
    } catch (err) {
      console.warn("⚠️ Erreur disconnect Twilio :", err);
    }

    AppState.twilioRoom = null;
    AppState.callState  = "idle";
  },


  // ============================
  // UTILITAIRES PRIVÉS
  // ============================

  // ✅ Collecte et émet toutes les tracks distantes actives
  _emitRemoteTracks(room) {
    const tracks = [];

    room.participants.forEach(participant => {
      participant.tracks.forEach(publication => {
        if (publication.track) {
          tracks.push(publication.track);
        }
      });
    });

    _cb.remoteTracks?.(tracks);
  }

};