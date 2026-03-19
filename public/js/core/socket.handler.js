// ======================================================
// CORE / SOCKET HANDLER (PROF) — VERSION FINALE SÛRE
// ======================================================

import { WhiteboardService } from "../services/whiteboard.service.js";
import { AppState } from "./state.js";
import { SessionService } from "../services/session.service.js";
import { sendWs } from "./socket.service.js"; // ✅ AJOUT — manquait

// ======================================================
// SOCKET HANDLER CENTRAL
// Enregistré dans socket.service.js via registerWsHandler
// UN SEUL appel par message — zéro doublon possible
// ======================================================
export function handleSocketMessage(data) {
  if (!data || typeof data !== "object" || typeof data.type !== "string") {
    console.warn("⚠️ Message WS invalide :", data);
    return;
  }
  console.log("🧠 HANDLE SOCKET PROF :", data.type);
  console.log("📩 WS PROF :", data.type, data);

  switch (data.type) {

    case "tableauStroke":
      SessionService._emit({
        type: "tableauStroke",
        stroke: data.stroke
      });
      return;

     case "tableauClear":
     WhiteboardService.applyRemoteClear(false); // ⬅️ IMPORTANT : ne pas réémettre
      return;


    case "tableauSync":
      SessionService._emit(data);
      return;

    // ================= APPELS =================
 case "incomingCall": {
  console.log("📩 WS PROF : incomingCall", data);

  if (typeof AppState.sessionCallback !== "function") {
    console.warn("⚠️ sessionCallback non défini");
    return;
  }

  // 🔥 On forward UNIQUEMENT au système session
  AppState.sessionCallback({
    type: "incomingCall",
    payload: {
      eleveId:    data?.eleveId ?? null,
      eleveName:  data?.eleveName ?? "Élève",
      eleveVille: data?.eleveVille ?? "",
      elevePays:  data?.elevePays ?? "",
      timestamp:  data?.timestamp ?? null
    }
  });

  break;
}
    case "callAccepted":
      console.log("✅ callAccepted — en attente de startSession");
      AppState.callState         = "inCall";
      AppState.sessionInProgress = true;
      return;

    case "callRejected":
      AppState.currentIncomingCallEleveId = null;
      return;

    case "callEnded":
      endSessionClean();
      return;

    case "joinedRoom":
      console.log("🎓 Room jointe :", data.roomId ?? "inconnue");
      return;

    case "userJoined":
      console.log("👤 Utilisateur rejoint :", data.userId ?? data);
      return;

    // ================= SESSION =================
    case "startSession": {
      const roomId = data.roomId ?? data.room ?? null;
      if (!roomId) {
        console.error("❌ startSession sans roomId :", data);
        return;
      }

      AppState.currentRoomId     = roomId;
      AppState.sessionInProgress = true;
      // 🟦 Initialiser le nom complet pour le chat
      window.userNameGlobal = `${data.prenom ?? ""} ${data.nom ?? ""}`.trim();
      // ✅ Rejoindre la room pour le tableau
      sendWs({ type: "joinRoom", roomId });

      SessionService.startVideoCall({ roomId, role: "prof" })
        .catch((err) => console.error("❌ startVideoCall :", err));

      console.log("🎬 Session PROF démarrée — room :", roomId);
      return;
    }

    case "session:stop":
      endSessionClean();
      return;

    case "chatMessage":
    case "document":
    case "visioSaved":
    case "error":
      SessionService._emit(data);
      return;

    default:
      console.warn("⚠️ Type WS non géré :", data.type);
  }
}

// ======================================================
// CLEANUP SESSION
// ======================================================
function endSessionClean() {
  WhiteboardService.stopAutoSnapshot?.();
  SessionService.stopVideoCall();
  WhiteboardService.reset?.();
  // ⏱️ Stopper le timer côté prof 
  AppState.stopTimer();
  AppState.currentIncomingCallEleveId = null;
  AppState.selectedStudentId          = null;
  AppState.currentRoomId              = null;
  AppState.sessionInProgress          = false;
  AppState.callState                  = null;
}