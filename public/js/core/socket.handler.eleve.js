// public/js/core/socket.handler.eleve.js

import { socketService } from "./socket.service.js";
import { AppState } from "./state.js";
import { SessionService } from "../services/session.service.js";
import { WhiteboardService } from "../services/whiteboard.service.js";
import { WSLogger } from "./ws.logger.js";

/**
 * SOCKET HANDLER (ELEVE)
 * Transforme WS → AppState (source de vérité)
 */
class SocketHandlerEleve {
  constructor() {
    this._unsubscribeSocket =
      socketService.onMessage((data) => this.handle(data));
  }

  handle(data) {
    if (!data || typeof data !== "object" || typeof data.type !== "string") {
      WSLogger.warn("WS invalide (élève) :", data);
      return;
    }

    WSLogger.debug("HANDLER ELEVE RECEIVE:", data.type);

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
         PRESENCE
      ====================================================== */
      case "onlineProfessors":
      case "professorsList":
        AppState.setOnlineProfessors(data.profs ?? data.professors ?? []);
        break;

      /* ======================================================
         CALL FLOW (NORMALISÉ)
      ====================================================== */
      case "callSent":
        AppState.setCallState("calling");
        break;

      case "incomingCall": {
        const eleveId = data?.eleveId ?? null;

        AppState.setIncomingCallEleveId?.(eleveId);
        AppState.setCallState("incoming");

        AppState._notify("call:incoming", {
          eleveId,
          eleveName: data?.eleveName ?? "Professeur",
          eleveVille: data?.eleveVille ?? "",
          elevePays: data?.elevePays ?? "",
          timestamp: data?.timestamp ?? null,
        });

        break;
      }

      case "callAccepted":
        AppState.setCallState("inCall");
        AppState.startSession({
          roomId: AppState.currentRoomId,
        });
        AppState.startTimer?.();
        break;

      case "callRejected":
        AppState.setCallState(null);
        AppState.setIncomingCallEleveId?.(null);
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
        WSLogger.info("Room jointe (élève) :", data.roomId);
        break;

      /* ======================================================
         CHAT
      ====================================================== */
      case "chatMessage":
        AppState.addChatMessage({
          sender: data.sender ?? "Professeur",
          text: data.text ?? "",
          messageId: data.messageId ?? null,
        });
        break;

      /* ======================================================
         DOCUMENTS
      ====================================================== */
      case "document":
        AppState.addDocument({
          fileName: data.fileName,
          fileData: data.fileData,
          sender: data.sender ?? "Professeur",
        });
        break;

      /* ======================================================
         WHITEBOARD / WEBRTC
      ====================================================== */
      case "tableauStroke":
      case "tableauSync":
        SessionService._emit(data);
        break;

      case "tableauClear":
        WhiteboardService.applyRemoteClear(false);
        break;

      case "webrtcSignal":
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

      /* ======================================================
         DIVERS
      ====================================================== */
      case "userJoined":
        WSLogger.info("Utilisateur rejoint :", data.userId);
        break;

      case "error":
        WSLogger.warn("Erreur serveur :", data.message);
        SessionService._emit(data);
        break;

      default:
        WSLogger.warn("Type WS non géré (élève) :", data.type);
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
     SESSION START
  ====================================================== */
  handleStartSession(data) {
    const roomId = data.roomId ?? data.room ?? null;
    if (!roomId) return;

    AppState.startSession({ roomId });

    window.userNameGlobal =
      `${data.prenom ?? ""} ${data.nom ?? ""}`.trim();

    socketService.send({ type: "joinRoom", roomId });

    SessionService.startVideoCall({
      roomId,
      role: "eleve",
    }).catch((err) =>
      WSLogger.error("startVideoCall (élève) :", err)
    );
  }

  /* ======================================================
     FIN SESSION
  ====================================================== */
  endSessionClean() {
    WhiteboardService.stopAutoSnapshot?.();
    SessionService.stopVideoCall();
    WhiteboardService.reset?.();

    AppState.stopTimer?.();
    AppState.endSession?.();
    AppState.setCallState(null);
    AppState.setIncomingCallEleveId?.(null);

    WSLogger.info("Session élève nettoyée");
  }

  /* ======================================================
     CLEANUP
  ====================================================== */
  destroy() {
    this._unsubscribeSocket();
  }
}

export const socketHandlerEleve = new SocketHandlerEleve();
