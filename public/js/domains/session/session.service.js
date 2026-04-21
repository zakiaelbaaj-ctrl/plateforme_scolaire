// ======================================================
// SESSION DOMAIN SERVICE â€” ROUTEUR MÃ‰TIER CENTRAL
// ======================================================

import { AppState } from "/js/core/state.js";
import { socketService } from "/js/core/socket.service.js";
import { ChatService } from "/js/domains/chat/chat.service.js";
import { CallService } from "/js/domains/call/call.service.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { DocumentService } from "/js/domains/document/document.service.js";

export const SessionService = {

  // --------------------------------------------------
  // SYSTÃˆME D'ABONNEMENT INTERNE
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
       updateToolButtons(); // âš¡ active / dÃ©sactive les boutons
       break;
     }

      case "startSession": {
        const roomId = data.roomId ?? data.room ?? null;
        if (!roomId) return;

        AppState.roomReady = false;
        AppState.currentRoomId = roomId;

        socketService.send({ type: "joinRoom", roomId });
        // âœ… Notifie le dashboard prof
        this._notify({ type: "sessionStarted", roomId });
        break;
      }

      case "joinedRoom": {
        // âš¡ Ã‰tat technique interne au domaine
        AppState.roomReady = true;
        break;
      }
      // âœ… Ajouter aprÃ¨s case "joinedRoom"
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
  CallService.handleEvent(data); // dÃ©lÃ¨gue Ã  CallService, pas de double appel
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
  // ðŸ”¹ Ignorer certaines erreurs cÃ´tÃ© Ã©lÃ¨ve
      if (data.message === "Stroke invalide" || 
      data.message === "stroke requis" || 
      data.message === "Vous n'Ãªtes pas dans cette room") break;
      console.error("WS Error:", data.message);
      break;
    }

      default:
        console.log("âš ï¸ Event non gÃ©rÃ© (SessionDomain):", data.type);
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

  stopVideoCall() {
    // 1. Déconnexion Twilio
    CallService.disconnectTwilio?.();
    
    // 2. On appelle endCall qui gère la logique métier et le setState
    CallService.endCall(); 
    
    // 3. On ferme la room sur le serveur
    this.endSession(); 
  },

  endSession() {
    if (AppState.currentRoomId) {
       socketService.send({ type: "endSession", roomId: AppState.currentRoomId });
    }
    
    // Nettoyage local via le service spécialisé
    CallService.handleSessionEnded?.();
  },

  // Utilise de préférence le timer central de l'AppState
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

