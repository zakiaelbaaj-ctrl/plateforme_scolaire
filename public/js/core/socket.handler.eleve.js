import { socketService } from "./socket.service.js";
import { AppState } from "./state.js";
import { SessionService } from "../services/session.service.js";
import { WSLogger } from "./ws.logger.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { CallStateMachine } from "../domains/call/call.state.machine.js";
import { CallService } from "../domains/call/call.service.js";

class SocketHandlerEleve {
  constructor() {
    this._unsubscribeSocket = socketService.onMessage((data) => this.handle(data));
    this._unsubscribeCall = AppState.on("ui:requestCall", (prof) => this.handleOutgoingCall(prof));
  }

  handle(data) {
    if (!data || !data.type) return;
    WSLogger.debug("FULL DATA:", data);
    WSLogger.debug("HANDLER ELEVE RECEIVE:", data.type);

    switch (data.type) {
      case "TRANSPORT_OPEN": this.onTransportOpen(); break;
      case "onlineProfessors":
      case "professorsList":
        AppState.setOnlineProfessors(data.profs ?? data.professors ?? []);
        break;
       case "document":
       case "documentReceived":
       case "newDocument": {
      console.log("📥 document reçu socket:", data);

      const raw = data.document ?? data;

      const normalizedDoc = {
      fileName: raw.fileName ?? raw.name,
      fileData: raw.fileData ?? raw.data,
      sender: raw.userName ?? raw.sender   // ✅ FIX ICI
      };

      console.log("📦 doc normalisé:", normalizedDoc);

      AppState.addDocument(normalizedDoc);
      break;
    }
      case "callSent":
      case "incomingCall":
      case "callAccepted":
      case "callRejected":
      case "twilioToken":
      case "callEnded":
      case "session:stop":
      case "twilioLocalTrack":
      case "twilioRemoteTracks":
        CallService.handleEvent(data);
        break;

      case "startSession": this.handleStartSession(data); break;
      case "joinedRoom":
        console.log("✅ [Élève] Room rejointe, démarrage de la session et du timer !");
        
        // On informe l'état global (sécurisé par ta vérification anti-boucle)
        AppState.startSession({ roomId: data.roomId ?? data.room });
        
        // ⏱️ ON LANCE LE CHRONO ICI
        AppState.startTimer();
        break;
      case "chatMessage":
        AppState.addChatMessage({ sender: data.sender, text: data.text });
        break;

      case "tableauStroke":
      case "tableauSync":
        WhiteboardService.handleEvent(data);
        break;

      default:
        WSLogger.warn("Type non géré:", data.type);
    }
  }

  onTransportOpen() {
    AppState.setWsConnected(true);
    if (AppState.currentUser?.id) {
      socketService.send({ type: "identify", ...AppState.currentUser });
    }
  }

  handleStartSession(data) {
    const roomId = data.roomId ?? data.room;
    if (!roomId) return;
    AppState.startSession({ roomId });
    socketService.send({ type: "joinRoom", roomId });
  }

  handleOutgoingCall(prof) {
    if (!prof?.id) return;
    CallService.callProfessor(prof.id);
  }

  destroy() {
    this._unsubscribeSocket();
    if (this._unsubscribeCall) this._unsubscribeCall();
  }
}

let instance = null;

export const socketHandlerEleve = {
  init() {
    if (!instance) {
      instance = new SocketHandlerEleve();
    }
  },
  destroy() {
    instance?.destroy();
    instance = null;
  }
};
