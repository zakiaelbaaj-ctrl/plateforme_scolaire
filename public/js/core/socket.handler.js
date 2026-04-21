import { socketService } from "./socket.service.js";
import { AppState } from "./state.js";
import { SessionService } from "../services/session.service.js";
import { WSLogger } from "./ws.logger.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { CallStateMachine } from "../domains/call/call.state.machine.js";
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
  AppState.emit("whiteboard:clear");
  break;
case "joinedRoom":
  console.log("✅ joinedRoom reçu côté prof", data);

  const roomId = data.roomId ?? data.room;

  if (!roomId) {
    console.warn("⚠️ joinedRoom sans roomId", data);
    break;
  }

  // sauvegarde de la room
  AppState.currentRoomId = roomId;

  AppState.startSession({ roomId });

  // passage en appel
  AppState.setCallState("inCall");

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

export const socketHandlerProf = new SocketHandlerProf();
