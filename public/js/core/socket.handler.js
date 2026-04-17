// public/js/core/socket.handler.prof.js

import { socketService } from "./socket.service.js";
import { AppState } from "./state.js";
import { SessionService } from "../services/session.service.js";
import { WhiteboardService } from "../services/whiteboard.service.js";
import { WSLogger } from "./ws.logger.js";

/**
 * SOCKET HANDLER (PROF)
 * Mappe les messages bruts du transport vers AppState.
 * API AppState : setters plats (setCallState, addChatMessage, startTimer…)
 */
class SocketHandlerProf {
  constructor() {
    this._unsubscribeSocket = socketService.onMessage((data) => this.handle(data));
    this._unsubscribeCall = AppState.on("ui:requestCall", (prof) => this.handleOutgoingCall(prof));
  }

  handle(data) {
    if (!data || !data.type) return;
    WSLogger.debug("HANDLER PROF RECEIVE:", data.type);

    switch (data.type) {

      /* ======================================================
         TRANSPORT
      ====================================================== */
      case "TRANSPORT_OPEN":
        this.onTransportOpen();
        break;

      case "TRANSPORT_CLOSED":
        AppState.setWsConnected(false);
        break;

      /* ======================================================
         PRÉSENCE
      ====================================================== */
      case "professorsList":
        AppState.setOnlineProfessors(data.professors ?? []);
        break;

      /* ======================================================
         TABLEAU BLANC
      ====================================================== */
      case "tableauStroke":
      case "tableauSync":
        SessionService._emit(data);
        break;

      case "tableauClear":
        WhiteboardService.applyRemoteClear(false);
        break;

      /* ======================================================
         APPELS
      ====================================================== */
      case "incomingCall":
        this.handleIncomingCall(data);
        break;

      case "callAccepted":
        AppState.setCallState("inCall");
        AppState.startSession({ roomId: AppState.currentRoomId });
        AppState.startTimer();
        break;

      case "callRejected":
        AppState.setIncomingCallEleveId(null);
        AppState.setCallState(null);
        break;

      case "callEnded":
      case "session:stop":
        this.endSessionClean();
        break;

      /* ======================================================
         SESSION
      ====================================================== */
      case "startSession":
        this.handleStartSession(data);
        break;

      case "joinedRoom":
        WSLogger.info("Room jointe :", data.roomId);
        break;

      /* ======================================================
         CHAT
      ====================================================== */
      case "chatMessage":
        AppState.addChatMessage({
          sender: data.sender ?? "Inconnu",
          text: data.text ?? "",
          messageId: data.messageId ?? null,
        });
        SessionService._emit(data);
        break;

      /* ======================================================
         DOCUMENTS
      ====================================================== */
      case "document":
        AppState.addDocument({
          fileName: data.fileName,
          fileData: data.fileData,
          sender: data.sender ?? "Inconnu",
        });
        SessionService._emit(data);
        break;

      /* ======================================================
         FACTURATION
      ====================================================== */
      case "invoice":
        AppState.showInvoice({
          amount: data.amount,
          duration: data.duration,
          sessionId: data.sessionId,
        });
        break;

      case "visioSaved":
        SessionService._emit(data);
        break;

      case "error":
        WSLogger.warn("Erreur serveur :", data.message);
        SessionService._emit(data);
        break;

      default:
        WSLogger.warn("Type WS non géré (prof) :", data.type);
    }
  }

  /* ======================================================
     TRANSPORT OPEN
  ====================================================== */
  onTransportOpen() {
    AppState.setWsConnected(true);

    if (AppState.currentUser?.id) {
      socketService.send({
        type: "identify",
        ...AppState.currentUser,
        tabId: sessionStorage.getItem("tabId"),
      });
    }
  }

  /* ======================================================
     APPEL ENTRANT
  ====================================================== */
  handleIncomingCall(data) {
    AppState.setIncomingCallEleveId(data?.eleveId ?? null);
    AppState.setCallState("incoming");

    if (typeof AppState.sessionCallback === "function") {
      AppState.sessionCallback({
        type: "incomingCall",
        payload: {
          eleveId:    data?.eleveId    ?? null,
          eleveName:  data?.eleveName  ?? "Élève",
          eleveVille: data?.eleveVille ?? "",
          elevePays:  data?.elevePays  ?? "",
          timestamp:  data?.timestamp  ?? null,
        },
      });
    } else {
      WSLogger.warn("AppState.sessionCallback non défini");
    }
  }

  /* ======================================================
     APPEL SORTANT
  ====================================================== */
  handleOutgoingCall(prof) {
    if (!prof?.id) return;

    AppState.setCallState("calling");
    AppState.selectedStudentId = prof.id;

    socketService.send({
      type: "callEleve",
      eleveId: prof.id,
      profId: AppState.currentUser?.id,
    });

    WSLogger.info("Appel sortant vers :", prof.prenom, prof.nom);
  }

  /* ======================================================
     DÉMARRAGE SESSION
  ====================================================== */
  handleStartSession(data) {
    const roomId = data.roomId ?? data.room ?? null;
    if (!roomId) return;

    AppState.startSession({ roomId, studentId: AppState.selectedStudentId });

    window.userNameGlobal = `${data.prenom ?? ""} ${data.nom ?? ""}`.trim();

    socketService.send({ type: "joinRoom", roomId });

    SessionService.startVideoCall({ roomId, role: "prof" })
      .catch((err) => WSLogger.error("startVideoCall :", err));
  }

  /* ======================================================
     FIN DE SESSION
  ====================================================== */
  endSessionClean() {
    WhiteboardService.stopAutoSnapshot?.();
    SessionService.stopVideoCall();
    WhiteboardService.reset?.();

    AppState.stopTimer();
    AppState.endSession();
    AppState.setCallState(null);
    AppState.setIncomingCallEleveId(null);
    AppState.selectedStudentId = null;

    WSLogger.info("Session prof nettoyée");
  }

  /* ======================================================
     NETTOYAGE
  ====================================================== */
  destroy() {
    this._unsubscribeSocket();
    this._unsubscribeCall();
  }
}

export const socketHandlerProf = new SocketHandlerProf();
