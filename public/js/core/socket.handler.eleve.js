// ======================================================
// CORE / SOCKET HANDLER — ELEVE (STABLE / PROD)
// ======================================================

import { AppState } from "./state.js";
import { updateCallButtonState } from "../modules/ui/uiRenderers.js";
import { SessionService } from "../services/session.service.js";
import { WhiteboardService } from "../services/whiteboard.service.js";
import { ChatService } from "/js/domains/chat/chat.service.js";
import { appendMessage } from "/js/ui/components/chat.view.js";

// ======================================================
// SOCKET MESSAGE HANDLER (CENTRAL)
// ======================================================
export function handleSocketMessageEleve(data) {
  if (!data || typeof data !== "object" || typeof data.type !== "string") {
    console.warn("⚠️ WS invalide (élève) :", data);
    return;
  }

  console.log("📩 WS ELEVE :", data.type);

  switch (data.type) {

    // ==================================================
    // PRESENCE PROFESSEURS
    // ==================================================
    case "onlineProfessors":
    case "professorsList": {
      const profs = data.profs || data.professors || [];

      if (AppState.professors?.setOnlineList) {
        AppState.professors.setOnlineList(profs);
      }

      if (typeof AppState.ui?.renderProfessorsList === "function") {
        AppState.ui.renderProfessorsList(profs);
      }

      if (
        AppState.callState !== "calling" &&
        AppState.callState !== "inCall"
      ) {
        updateCallButtonState(profs.length > 0 ? "ready" : "disabled");
      }

      return;
    }

    // ==================================================
    // CALL FLOW (UI ONLY)
    // ==================================================
    case "callSent":
      AppState.callState = "calling";
      updateCallButtonState("calling");
      return;

    case "callAccepted":
      AppState.call.inProgress = true;
      AppState.call.startedAt = Date.now();
      AppState.callState = "calling";
      updateCallButtonState("calling");
      return;

    case "callEnded":
    case "session:stop":
      endSessionCleanEleve();
      updateCallButtonState("ready");
      return;

    // ==================================================
    // 🚀 SESSION EVENTS → DÉLÉGUÉS À SessionService
    // ==================================================
    case "startSession":
    case "joinedRoom":
    case "chatMessage": {
  const data = ChatService.receive(event);
  if (!data) return;
  appendMessage(data.sender, data.text);
  break;
  }

    case "document":
    case "tableauStroke":
    case "tableauClear":
    case "tableauSync":
    case "webrtcSignal":
    case "error":
      // 🔥 CENTRALISATION PROPRE
      SessionService._handleWs(data);
      return;

    // ==================================================
    // ROOM INFO (OPTIONNEL)
    // ==================================================
    case "userJoined":
      console.log("👤 Utilisateur rejoint :", data.userId);
      return;

    default:
      console.warn("⚠️ Type WS non géré (élève) :", data.type);
  }
}