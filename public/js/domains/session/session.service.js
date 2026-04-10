// ======================================================
// SESSION DOMAIN SERVICE — ROUTEUR MÉTIER CENTRAL
// ======================================================

import { AppState } from "/js/core/state.js";
import { SocketService } from "/js/core/socket.service.js";
import { ChatService } from "/js/domains/chat/chat.service.js";
import { CallService } from "/js/domains/call/call.service.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { DocumentService } from "/js/domains/document/document.service.js";

export const SessionService = {

  // --------------------------------------------------
  // SYSTÈME D'ABONNEMENT INTERNE
  // --------------------------------------------------

  _listeners: [],

  init(callback) {
    if (typeof callback === "function") {
      this._listeners.push(callback);
    }
  },

  _notify(event) {
    this._listeners.forEach(cb => cb(event));
  },


  // --------------------------------------------------
  // ROUTAGE CENTRAL DES EVENTS WS
  // --------------------------------------------------

  _handleWs(data) {
    if (!data?.type) return;

    switch (data.type) {
      case "grantWhiteboardAccess": {
      AppState.canUseTools = !!data.tools; // true ou false
       updateToolButtons(); // ⚡ active / désactive les boutons
       break;
     }

      case "startSession": {
        const roomId = data.roomId ?? data.room ?? null;
        if (!roomId) return;

        AppState.roomReady = false;
        AppState.currentRoomId = roomId;

        SocketService.send({ type: "joinRoom", roomId });
        // ✅ Notifie le dashboard prof
        this._notify({ type: "sessionStarted", roomId });
        break;
      }

      case "joinedRoom": {
        // ⚡ État technique interne au domaine
        AppState.roomReady = true;
        break;
      }
      // ✅ Ajouter après case "joinedRoom"
       case "userJoined": {
  // L'autre participant a rejoint la room
  // On notifie le dashboard et on attend le twilioToken
       this._notify({
       type:     "userJoined",
       userId:   data.userId   ?? null,
       userName: data.userName ?? null
      });
      break;
      }

      case "endSession": {
        AppState.currentRoomId = null;
        AppState.roomReady = false;
        CallService.handleSessionEnded?.();
        break;
      }

      case "chatMessage": {
        ChatService.handleEvent(data);
        break;
      }
      case "document": {
      DocumentService.handleEvent(data);
      break;
      }

      case "tableauStroke":
      case "tableauClear":
      case "tableauSync": {
        WhiteboardService.handleEvent(data);
        break;
      }

      case "twilioToken": {
  CallService.handleEvent(data); // délègue à CallService, pas de double appel
  break;
}

case "callSent": {
  CallService.handleEvent(data);
  break;
}

case "incomingCall": {
  CallService.handleEvent(data);
  break;
}

case "callAccepted":
case "callRejected":
case "callEnded":
case "twilioLocalTrack":
case "twilioRemoteTracks":
case "twilioDisconnected": {
  CallService.handleEvent(data);
  break;
     }

       case "onlineProfessors": {
        this._notify({
       type: "onlineProfessors",
       profs: data.profs ?? []
       });
        break;
       }

       case "error": {
  // 🔹 Ignorer certaines erreurs côté élève
      if (data.message === "Stroke invalide" || 
      data.message === "stroke requis" || 
      data.message === "Vous n'êtes pas dans cette room") break;
      console.error("WS Error:", data.message);
      break;
    }

      default:
        console.log("⚠️ Event non géré (SessionDomain):", data.type);
    }
  },


  // --------------------------------------------------
  // ACTIONS SORTANTES
  // --------------------------------------------------
  sendDocument(file) {
  console.log("SessionService.sendDocument appelé avec fichier :", file);
  if (!file || !AppState.currentRoomId) return;
  DocumentService.send(file);
},
  callProfessor(profId) { 
  CallService.callProfessor(profId); 
  },

  stopVideoCall() {
  CallService.disconnectTwilio();
  CallService.leaveRoom();
  this.endSession(); // Termine la session côté serveur et local
   },
   // --------------------------------------------------
// FIN DE SESSION
// --------------------------------------------------
endSession() {
  // ⚡ Envoi au serveur pour finir la session
  SocketService.send({ type: "endSession", roomId: AppState.currentRoomId });

  // ⚡ Local : stoppe timer et appelle CallService
  this.stopTimer();
  CallService.handleSessionEnded?.();
},

// --------------------------------------------------
// TIMER
// --------------------------------------------------

startTimer(callback) {
  
  this.stopTimer();

  let seconds = 0;

  AppState._timerInterval = setInterval(() => {
    seconds++;
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    callback?.(`${mm}:${ss}`);
  }, 1000);
},
  stopTimer() {
    if (AppState._timerInterval) {
      clearInterval(AppState._timerInterval);
      AppState._timerInterval = null;
    }
  }

};