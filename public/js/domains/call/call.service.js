import { AppState } from "../../core/state.js";
import { socketService } from "../../core/socket.service.js";
import { VideoService } from "./video.service.js";
import { CallStateMachine } from "./call.state.machine.js";
import { WhiteboardService } from "../whiteboard/whiteboard.service.js";

export const CallService = {
  handleEvent(data) {
    if (!data || !data.type) return;

    switch (data.type) {
                  case "startSession":
        const roomId = data.roomId || data.room;
        if (roomId) {
          console.log("?? Démarrage de la session clinique pour la room:", roomId);
          
          // Mise à jour de l'état global
          if (typeof AppState !== 'undefined') AppState.startSession({ roomId });
          
          // On change l'état de la machine d'appel
          if (typeof CallStateMachine !== 'undefined') CallStateMachine.setState(CallStateMachine.STATES.IN_CALL);

          // Initialisation du tableau blanc après un court délai pour le rendu DOM
          setTimeout(() => {
            const wb = window.WhiteboardService;
            if (wb && typeof wb.initCanvas === 'function') {
              console.log("?? Initialisation du tableau blanc...");
              wb.initCanvas("whiteboard-canvas", roomId);
              const wrapper = document.getElementById("whiteboard-wrapper");
              if (wrapper) wrapper.style.display = "block";
            }
          }, 500);
        }
        break;

      case "twilioToken":
        if (data.token) {
          console.log("?? [TWILIO] Connexion avec Token String");
          VideoService.connect(data.token);
        }
        break;

      case "incomingCall":
        AppState.setIncomingCallEleveId?.(data.eleveId);
        AppState._notify("call:incoming", data);
        break;

      case "callAccepted":
        CallStateMachine.setState?.(CallStateMachine.STATES.IN_CALL);
        break;

      case "callEnded":
      case "session:stop":
        this.terminateCall();
        break;
    }
  },

  callProfessor(profId) {
    const pId = parseInt(profId);
    socketService.send({ 
      type: "callProfessor", 
      profId: pId 
    });
  },

  terminateCall() {
    if (!VideoService.room) return; // Ignorer si pas de session Twilio active
    AppState.endSession?.();
    VideoService.disconnect?.();
    AppState._notify("ui:closeCallOverlay");
    CallStateMachine.setState(CallStateMachine.STATES.ENDED);
  }
};


