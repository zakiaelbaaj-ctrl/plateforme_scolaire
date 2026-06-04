// ======================================================
// SOCKET ET HANDLER — ÉTUDIANT ↔ ÉTUDIANT
// Transforme les messages WS → événements applicatifs
// ======================================================

import { AppState } from "/js/core/state.js";
import { eventBus } from "/js/core/eventBus.js";
import { Logger }   from "/js/lib/logger.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
// ======================================================
// HANDLER PRINCIPAL
// ======================================================

export function handleStudentSocketMessage(data) {
  
  console.log("📩 WS RAW:", JSON.stringify(data));
  if (!data || !data.type) {
    Logger.warn("📩 Message WS invalide :", data);
    return;
  }

  Logger.log("📩 WS étudiant :", data.type);

  switch (data.type) {

    // ==================================================
    // 🔒 TRANSPORT
    // ==================================================

    case "TRANSPORT_OPEN":
     eventBus.emit("socket:open");
     eventBus.emit("ws:status", { status: "connected" }); // ✅ AJOUTER
     break;

    case "TRANSPORT_CLOSED":
  eventBus.emit("socket:close");
  eventBus.emit("ws:status", { status: "reconnecting" }); // ✅ AJOUTER
  break;

  case "ws:status":
  eventBus.emit("ws:status", data);
  break;
    // ==================================================
    // 👥 UTILISATEURS EN LIGNE
    // ==================================================

    case "student:onlineStudents":
      AppState.setOnlineStudents?.(data.students || []);
      eventBus.emit("students:online", data.students || []);
      break;

    // ==================================================
    // 🎯 MATCHMAKING
    // ==================================================

    case "student:queued":
      AppState.isQueueing = true;
      eventBus.emit("student:queued", {
        matiere: data.matiere,
      });
      break;

    case "student:dequeued":
      AppState.isQueueing = false;
      eventBus.emit("student:dequeued");
      break;

      
  case "student:matchFound":
case "student:match-found":
  AppState.isQueueing = false;
  AppState.partnerName = data.partnerName || "Partenaire";
  eventBus.emit("student:match-found", {
    roomId:    data.roomId,
    initiator: data.initiator,
    partnerName: data.partnerName,
    partnerVille: data.partnerVille || "",
    partnerPays:  data.partnerPays  || "",
  });
  break;

case "student:session-ready":
case "student:sessionReady":
  // Ignoré — WebRTC déjà lancé depuis matchFound
  Logger.log("📡 sessionReady ignoré — WebRTC déjà initié");
  break;

    // ==================================================
    // 🔒 SESSION
    // ==================================================

    case "student:joined-room":
      case "student:joinedRoom":
      eventBus.emit("student:joined-room", {
        roomId: data.roomId,
      });
      break;
     case "student:userJoined":
     case "student:user-joined":
      eventBus.emit("student:user-joined", {
        userId:   data.userId,
        userName: data.userName,
      });
      break;

   case "student:user-left":
case "student:userLeft":
  Logger.log("📡 Le partenaire a quitté, notification envoyée à l'orchestrateur pour cleanup...");
  
  // Repasse uniquement le bébé à l'orchestrateur via l'eventBus
  eventBus.emit("student:user-left", {
    userId: data.userId,
  });
  break;

    case "student:session-ready":
    case "student:sessionReady":
  Logger.log("📡 Sockets : Session prête, initiateur :", data.initiator);
  if (!AppState.sessionInProgress) {
    eventBus.emit("student:match-found", {
      roomId:    data.roomId,
      initiator: data.initiator,
      partnerName: data.partnerName,
    });
  }
  break

    // ==================================================
    // 🔍 SIGNALING WEBRTC
    // ==================================================

    case "student:signal":
      eventBus.emit("webrtc:signal", data.signal);
      break;

    // ==================================================
    // 🔒 CHAT (fallback serveur)
    // ==================================================

   case "student:chatMessage": {
      // 1. Récupération de l'utilisateur connecté actuellement sur CE navigateur
      const monId = AppState.currentUser?.id;
      const monNomComplet = `${AppState.currentUser?.prenom || ""} ${AppState.currentUser?.nom || ""}`.trim();

      // 2. 🛑 FILTRE D'AUTORÉCEPTION : On ne bloque QUE si le message vient de nous-mêmes
      const vientDeMoi = (data.userId && data.userId === monId) || 
                         (data.sender === monNomComplet);

      if (vientDeMoi) {
        // C'est mon propre message qui revient du serveur.
        // Si l'UI l'affiche déjà localement, on l'ignore pour éviter le doublon.
        Logger.log("🚫 Mon propre message est revenu du serveur (Ignoré pour éviter le doublon)");
        break; 
      }

      // 3. Si le message vient du partenaire (ex: Sasy pour Fady, ou Fady pour Sasy), on transmet !
      Logger.log(`✏️ Message reçu de l'autre utilisateur (${data.sender}), affichage à l'écran.`);
      eventBus.emit("chat:message", {
        sender: data.sender,
        text:   data.text,
      });
      break;
    }
    // ==================================================
    // 🔒 DOCUMENT (fallback serveur)
    // ==================================================

    case "student:document":
      eventBus.emit("document:received", {
        fileName: data.fileName,
        fileData: data.fileData,
      });
      break;

    // ==================================================
    // 🔒 ABONNEMENT
    // ==================================================

    case "student:no-subscription":
      AppState.hasSubscription = false;
      eventBus.emit("subscription:required");
      break;

    case "student:subscription-active":
      AppState.hasSubscription = true;
      eventBus.emit("subscription:active");
      break;
     // ==================================================
// "👨‍🏫 PROFESSEURS EN LIGNE"
// ==================================================

case "onlineProfessors":
  AppState.onlineProfessors = data.professors || [];
  eventBus.emit("professors:online", data.professors || []);
  break;

// ==================================================
// console.error("❌ ERREUR SERVEUR");
// ==================================================

case "error":
  Logger.warn("📩 Erreur serveur :", data.code, data.message);
  eventBus.emit("server:error", {
    code:    data.code,
    message: data.message,
  });
  break;
  // ==================================================
    // 🎨 TABLEAU BLANC
    // ==================================================
  case "tableauStroke": {
  WhiteboardService.handleEvent({
    type:   "tableauStroke",
    path:   data.stroke,
  });
  break;
}

case "tableauClear": {
  WhiteboardService.handleEvent({
    type:     "tableauClear",
    authorId: data.userId,
  });
  break;
}

case "tableauUndo": {
  WhiteboardService.handleEvent({
    type:     "tableauUndo",
    authorId: data.userId,
  });
  break;
}

case "tableauRedo": {
  WhiteboardService.handleEvent({
    type:     "tableauRedo",
    authorId: data.userId,
  });
  break;
}

case "tableauSync": {
  WhiteboardService.handleEvent({
    type:  "tableauSync",
    paths: data.paths,
  });
  break;
}
// À AJOUTER dans socket.handler.etudiant.js

case "tableauText": {
  WhiteboardService.handleEvent({
    type:       "tableauText",
    textStroke: data.textStroke ?? data.stroke,
  });
  break;
}

case "tableauTool": {
  WhiteboardService.handleEvent({
    type: "tableauTool",
    tool: data.tool,
  });
  break;
}
    // ==================================================
// ❓ DEFAULT
// ==================================================

default:
  Logger.warn("⚠️ Type WS étudiant non géré :", data.type, data);
  }
}
