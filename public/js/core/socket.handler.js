import { socketService } from "./socket.service.js";
import { AppState } from "./state.js";
import { WSLogger } from "./ws.logger.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { CallService } from "../domains/call/call.service.js";

class SocketHandlerProf {
  constructor() {
    this._unsubscribeSocket = socketService.onMessage((data) => this.handle(data));
    this._unsubscribeCall = AppState.on("ui:requestCall", (prof) => this.handleOutgoingCall(prof));
  }

  handle(data) {
    if (!data || !data.type) return;
    WSLogger.debug("🔥 PROF RAW SOCKET:", data);
    WSLogger.debug("HANDLER PROF RECEIVE:", data.type);

    switch (data.type) {
      case "TRANSPORT_OPEN": 
        this.onTransportOpen(); 
        break;
     case "document":
     case "documentReceived":
     case "newDocument": {
     console.log("📥 document reçu PROF:", data);

     const raw = data.document ?? data;

const normalizedDoc = {
  fileName: raw.fileName ?? raw.name ?? "unknown",
  fileData: raw.fileData ?? raw.data ?? null,
  sender: raw.userName ?? raw.sender ?? "Inconnu"
};

      console.log("📦 doc normalisé PROF:", normalizedDoc);

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
        CallService.handleEvent(data);
        break;

      case "startSession": 
  this.handleStartSession(data); 
  break;

// ✅ joinedRoom : ne reappelle PAS startSession, démarre juste le timer
case "joinedRoom": {
  console.log("✅ joinedRoom reçu côté prof", data);
  const roomId = data.roomId ?? data.room;
  if (!roomId) { console.warn("⚠️ joinedRoom sans roomId", data); break; }

  // ✅ PAS de startSession ici (déjà fait dans handleStartSession)
  // ✅ PAS de setCallState ici (CallService.handleEvent("startSession") le fait)

  // ✅ Timer démarré ici, une seule fois
  AppState.startTimer();
  break;
}

      case "chatMessage":
        AppState.addChatMessage({
          sender: data.sender ?? "�l�ve",
          text: data.text ?? ""
        });
        break;

      case "tableauStroke":
      case "tableauSync":
        WhiteboardService.handleEvent(data);
        break;

      case "tableauClear":
        AppState._notify("whiteboard:clear"); // ✅ corrigé : _notify au lieu de emit
        break;

      case "userJoined":
      case "userLeft":
        break;

      default:
        WSLogger.warn("Type WS non géré (prof) :", data.type);
    }
  }
  onTransportOpen() {
    AppState.setWsConnected(true);
    if (AppState.currentUser?.id) {
      socketService.send({
        type: "identify",
        ...AppState.currentUser,
        tabId: sessionStorage.getItem("tabId")
      });
    }
  }

 handleStartSession(data) {
  const roomId = data.roomId ?? data.room;
  if (!roomId) return;
  AppState.startSession({ roomId }); // ← une seule fois
  socketService.send({ type: "joinRoom", roomId });
  // ✅ Timer démarré dans joinedRoom, pas ici
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

export const socketHandlerProf = new SocketHandlerProf();
