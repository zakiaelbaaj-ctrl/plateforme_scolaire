import { AppState } from "../../core/state.js";
import { socketService } from "../../core/socket.service.js";
import { VideoService } from "./video.service.js";
import { CallStateMachine } from "./call.state.machine.js";

export const CallService = {
  _callbacks: {},

 // ✅ Corriger
_on(event, cb) {
  this._callbacks[event] = cb;
},
  _emit(event, data) {
    if (this._callbacks[event]) this._callbacks[event](data);
  },

  onCallSent(cb)      { this._on("callSent", cb); },
  onCallAccepted(cb)  { this._on("callAccepted", cb); },
  onConnected(cb)     { this._on("connected", cb); },
  onCallRejected(cb)  { this._on("callRejected", cb); },
  onCallEnded(cb)     { this._on("callEnded", cb); },
  onLocalTrack(cb)    { this._on("localTrack", cb); },
  onRemoteTracks(cb)  { this._on("remoteTracks", cb); },
  onDisconnected(cb)  { this._on("disconnected", cb); },

  handleEvent(data) {
    if (!data?.type) return;

    switch (data.type) {
      case "startSession": {
        const roomId = data.roomId ?? data.room ?? null;
        if (!roomId) return;
        AppState.startSession({ roomId });
        CallStateMachine.setState(CallStateMachine.STATES.IN_CALL);
        setTimeout(() => {
          const wb = window.WhiteboardService;
          if (wb?.initCanvas) {
            wb.initCanvas("whiteboard-canvas", roomId);
            const wrapper = document.getElementById("whiteboard-wrapper");
            if (wrapper) wrapper.style.display = "block";
          }
        }, 500);
        break;
      }
       case "tableauClear": {
        const wb = window.WhiteboardService;
        if (wb && typeof wb.clearCanvas === "function") {
          // On efface localement le tableau (false pour éviter de renvoyer l'event en boucle au serveur)
          wb.clearCanvas(false); 
        } else if (wb && typeof wb.initCanvas === "function") {
          // Si clearCanvas n'existe pas, certaines structures ré-initialisent juste le canvas
          const roomId = AppState.currentRoomId;
          if (roomId) wb.initCanvas("whiteboard-canvas", roomId);
        }
        break;
      }
      case "twilioToken":
        if (data.token) VideoService.connect(data.token);
        break;

      case "incomingCall":
        AppState.setIncomingCallEleveId(data.eleveId);
        AppState._notify("call:incoming", data);
        break;

      case "callAccepted":
        CallStateMachine.setState(CallStateMachine.STATES.IN_CALL);
        break;

      case "callEnded":
      case "session:stop":
        this.terminateCall();
        break;
    }
  },

  callProfessor(profId) {
    socketService.send({ type: "callProfessor", profId: parseInt(profId) });
  },

  // 🛑 Guard anti-double-appel
  _terminating: false,

  terminateCall() {
    console.log("🔴 terminateCall ENTER", {
    currentRoomId: AppState.currentRoomId,
    terminating: this._terminating
  });
    // 🌟 ÉTAPE 1 : Si un nettoyage est déjà en cours, ou si la session est DÉJÀ nettoyée, on sort immédiatement
    if (this._terminating || !AppState.currentRoomId) {
      return; 
    }
    this._terminating = true;

    console.log("🛑 terminateCall()");

    // 🌟 L'ASTUCE : On sauvegarde l'ID avant que le système ne l'efface
    const savedRoomId = AppState.currentRoomId;

    // 1. Déconnexion Twilio (sans déclencher setState via l'event "disconnected")
    VideoService.disconnectSilent(); // nouveau : ne setState pas

    // 2. Machine d'état → ended (une seule fois)
    CallStateMachine.setState(CallStateMachine.STATES.ENDED);

    // 3. Nettoyage AppState (endSession efface currentRoomId)
    AppState.stopTimer();
    AppState.endSession(); 

    // 4. Notif UI
    AppState._notify("ui:closeCallOverlay");

    this._terminating = false;
  },
  handleSessionEnded() {
    this.terminateCall();
  },

  disconnectTwilio() {
    VideoService.disconnectSilent();
  }
};