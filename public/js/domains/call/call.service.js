// ======================================================
// CALL DOMAIN SERVICE — LOGIQUE VISIO / APPEL
// ======================================================

import { AppState } from "/js/core/state.js";
import { SocketService } from "/js/core/socket.service.js";
import { VideoService } from "./video.service.js";

// ============================
// CALLBACKS UI
// ============================
const _cb = {
  callSent: null,
  callAccepted: null,
  callRejected: null,
  callEnded: null,
  localTrack: null,
  remoteTracks: null,
  disconnected: null,
  incomingCall: null,
  connected: null,
  professorsList: null,
  // ❌ documentOpened supprimé pour éviter ouverture automatique
};

export const CallService = {

  // ============================
  // ABONNEMENTS UI
  // ============================
  onCallSent(cb) { _cb.callSent = cb; },
  onCallAccepted(cb) { _cb.callAccepted = cb; },
  onCallRejected(cb) { _cb.callRejected = cb; },
  onCallEnded(cb) { _cb.callEnded = cb; },
  onLocalTrack(cb) { _cb.localTrack = cb; },
  onRemoteTracks(cb) { _cb.remoteTracks = cb; },
  onDisconnected(cb) { _cb.disconnected = cb; },
  onIncomingCall(cb) { _cb.incomingCall = cb; },
  onConnected(cb) { _cb.connected = cb; },
  onProfessorsList(cb) { _cb.professorsList = cb; },

  // ============================
  // RÉCEPTION ÉVÉNEMENTS
  // ============================
  handleEvent(data) {
    switch (data.type) {

      case "professorsList":
        if (!Array.isArray(data.professors)) break;
        AppState.professors = data.professors;
        _cb.professorsList?.(data.professors);
        break;

      case "documentOpened":
        if (!data || !data.url) break;
        console.log("📄 Document reçu (stocké pour téléchargement) :", data);
        // 🔹 Stockage uniquement
        AppState.pendingDocument = {
          url: data.url,
          fileName: data.fileName || data.url.split("/").pop()
        };
        // ❌ NE PAS appeler _cb.documentOpened
        break;

      case "callSent":
        AppState.callState = "calling";
        _cb.callSent?.();
        break;

        case "callAccepted": {
        AppState.callState = "inCall";
        AppState.call.start(AppState.call.professorId); // ← ajouter
       _cb.callAccepted?.();
          break;
      }

      case "callRejected":
        AppState.callState = "idle";
        _cb.callRejected?.();
        break;

      case "incomingCall":
        _cb.incomingCall?.({
          eleveId: data.eleveId,
          eleveName: data.eleveName || data.userName || "Élève",
          eleveVille: data.eleveVille || "",
          elevePays: data.elevePays || ""
        });
        break;

      case "twilioToken":
        if (!data.token || !data.roomName) break;
        CallService.connectToTwilioRoom(data.token, data.roomName)
          .catch(err => console.error("❌ Erreur connexion Twilio:", err));
        break;

      case "callEnded":
        AppState.callState = "idle";
        _cb.callEnded?.();
        break;

      case "twilioLocalTrack":
        _cb.localTrack?.(data.track);
        break;

      case "twilioRemoteTracks":
        _cb.remoteTracks?.(data.tracks);
        break;

      case "twilioDisconnected":
        AppState.callState = "idle";
        _cb.disconnected?.();
        break;
    }
  },

  // ============================
// FIN DE SESSION
// ============================

     handleSessionEnded() {
     AppState.callState = "idle";
     AppState.call.end(); // ← remet startedAt à null
     VideoService.disconnect();
    _cb.callEnded?.();
   },

// ============================
// ACTIONS SORTANTES
// ============================

callProfessor(profId) {
  if (!profId) return;

  if (AppState.callState === "calling" || AppState.callState === "inCall") {
    console.warn("Appel déjà en cours");
    return;
  }

  AppState.callState = "calling";

  SocketService.send({
    type: "callProfessor",
    profId
  });
},

endCall() {
  // ✅ Envoyer la durée avant de terminer
  if (AppState.call.startedAt) {
    const durationSec = Math.floor((Date.now() - AppState.call.startedAt) / 1000);
    SocketService.send({
      type: "visioDuration",
      roomId: AppState.currentRoomId,
      duration: durationSec,
      matiere: AppState.currentUser?.matiere || null
    });
  }
       SocketService.send({ type: "endSession" });
      },
       leaveRoom() {
        SocketService.send({ type: "leaveRoom" });
      },
  // ============================
  // TWILIO
  // ============================
  async connectToTwilioRoom(token, roomName) {
    if (VideoService.clearListeners) VideoService.clearListeners();

    VideoService.onLocalTrack(track => _cb.localTrack?.(track));
    VideoService.onRemoteTracks(tracks => _cb.remoteTracks?.(tracks));
    VideoService.onDisconnected(() => {
      AppState.callState = "idle";
      _cb.disconnected?.();
    });

    const room = await VideoService.connect(token, roomName);

    if (room) {
      AppState.callState = "inCall";
      // 🔹 NE JAMAIS OUVRIR DE DOCUMENT ICI
      _cb.connected?.({ roomName: room.name });
      if (room.document) {
        AppState.pendingDocument = {
          url: room.document.url,
          fileName: room.document.fileName || room.document.url.split("/").pop()
        };
      }
    }

    return room;
  },

  disconnectTwilio() {
    VideoService.disconnect();
  }
};