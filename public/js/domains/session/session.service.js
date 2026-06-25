// ======================================================
// SESSION DOMAIN SERVICE — ROUTEUR MÉTIER CENTRAL
// ======================================================

import { AppState } from "/js/core/state.js";
import { socketService } from "/js/core/socket.service.js";
import { ChatService } from "/js/domains/chat/chat.service.js";
import { ScreenShareService } from "/js/domains/call/screen.share.service.js";
import { VideoService } from "/js/domains/call/video.service.js";
import { CallService } from "/js/domains/call/call.service.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { DocumentService } from "/js/domains/document/document.service.js";
import { updateToolButtons } from "/js/domains/whiteboard/whiteboard.contract.js";
import { CallStateMachine } from "/js/domains/call/call.state.machine.js";
export const SessionService = {

  // --------------------------------------------------
  // SYSTEME D'ABONNEMENT INTERNE
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
  AppState.canUseTools = !!data.tools;
  this._notify({
  type: "whiteboardAccess",
  canUse: AppState.canUseTools
});
  break;
     }

      case "startSession": {
        const roomId = data.roomId ?? data.room ?? null;
        if (!roomId) return;

        AppState.roomReady = false;
        AppState.currentRoomId = roomId;

        socketService.send({ type: "joinRoom", roomId });
        /// ✅ Notifie le dashboard prof
        this._notify({ type: "sessionStarted", roomId });
        break;
      }

       case "joinedRoom": {
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
       case "session:stop":
       case "callEnded":
      case "endSession": {
  AppState.currentRoomId = null;
  AppState.roomReady = false;
  this.stopHeartbeat();
  socketService.markSessionEnded(); // ✅ coupe le flood immédiatement
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
        this.startHeartbeat(); // ✅ Timer commence quand le prof accepte
       CallService.handleEvent(data); // délègue à CallService, pas de double appel
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
       
       case "onlineStudents": {
      this._notify({ type: "onlineStudents", students: data.students ?? [] });
       break;
      }
      case "matchFound": {
     AppState.currentRoomId = data.roomId;
     this._notify({
     type: "sessionStarted",
     roomId: data.roomId,
     partnerName: data.partnerName
     });
      socketService.send({ type: "joinRoom", roomId: data.roomId });
     break;
      }

       case "error": {
  //  Ignorer certaines erreurs côté élève
      if (data.message === "Stroke invalide" || 
      data.message === "stroke requis" || 
      data.message === "Vous n'êtes pas dans cette room") break;
      console.error("WS Error:", data.message);
      break;
    }
      case "TRANSPORT_OPEN": {
      socketService.markSessionActive(); // ✅ prêt pour une nouvelle session
      break;
  }
      case "TRANSPORT_CLOSED":
      break;
      default:
        console.log("🛑 Event non géré (SessionDomain):", data.type);
    }
  },


  // --------------------------------------------------
  // ACTIONS SORTANTES (CORRIGÉES)
  // --------------------------------------------------
  sendDocument(file) {
    if (!file || !AppState.currentRoomId) return;
    DocumentService.send(file);
  },

 callProfessor(profId) { 
  CallService.callProfessor(profId); 
},
requestStudentMatch(matiere) {
  if (!matiere) return;
  socketService.send({
    type: "requestStudentMatch",
    matiere,
    niveau: AppState.currentUser?.niveau || ""
  });
},

// ✅ NOUVEAU — appelé uniquement par CallService.terminateCall()
handleCallTerminated() {
  this.stopHeartbeat();
  this.stopTimer();
  AppState.endSession();      // currentRoomId → null
  CallStateMachine.reset();   // ended → idle (ici et nulle part ailleurs)
},

async stopVideoCall() {
  console.log("🛑 SessionService stopVideoCall");
  
  // ✅ N'appelle stop que si un partage est actif
  if (ScreenShareService.isSharing()) {
    await ScreenShareService.stop(VideoService.room).catch(() => {});
  }
  
  this.endSession();
  socketService.markSessionEnded();
  await CallService.terminateCall();
},

endSession() {
  // 🟢 Si currentRoomId est null, on s'arrête tout de suite
  if (!AppState.currentRoomId) {
    return;
  }

  // 🔵 Si on arrive ici, currentRoomId est forcément valide
  console.log("🛑 endSession envoyée, roomId:", AppState.currentRoomId);
  socketService.send({ type: "endSession", roomId: AppState.currentRoomId });

  // ✅ NE PAS appeler handleSessionEnded ici — c'est terminateCall qui s'en charge
},

  // ==============================================================
  //⏱️ GESTION DU TIMER (Déléguée proprement à l'AppState)
  // ==============================================================
  
  startTimer() {
    if (typeof AppState !== 'undefined' && AppState.startTimer) {
      console.log("🛑 SessionService demande le démarrage du timer...");
      AppState.startTimer();
    } else {
      console.warn("🛑 Impossible de démarrer le timer : AppState.startTimer est introuvable.");
    }
  },
  
    stopTimer() {
    if (typeof AppState !== 'undefined' && AppState.stopTimer) {
      console.log("🛑 SessionService demande l'arrêt du timer...");
      AppState.stopTimer();
    }
  },

  startHeartbeat() {
    if (this.heartbeat) return; // évite double interval

    this.heartbeat = setInterval(() => {
      if (!AppState.currentRoomId) return;

      socketService.send({
        type: "heartbeat",
        roomId: AppState.currentRoomId,
        paymentIntentId: AppState.currentPaymentIntentId
      });
    }, 10000);
  },

  stopHeartbeat() {
    clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

}; 

