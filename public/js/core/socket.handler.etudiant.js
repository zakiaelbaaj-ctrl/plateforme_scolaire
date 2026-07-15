// ======================================================
// SOCKET ET HANDLER — ÉTUDIANT ↔ ÉTUDIANT
// Transforme les messages WS → événements applicatifs
// ======================================================

import { AppState } from "/js/core/state.js";
import { eventBus } from "/js/core/eventBus.js";
import { Logger }   from "/js/lib/logger.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { StudentSessionStorage } from "/js/domains/etudiant-session/student.session.storage.js";

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
      console.log("B - TRANSPORT_OPEN");
     eventBus.emit("socket:open");
     eventBus.emit("ws:status", { status: "connected" }); // ✅ AJOUTER
     {
     const pendingRoomId = StudentSessionStorage.get();
        if (pendingRoomId) {
           const partner = StudentSessionStorage.getPartner();
          Logger.log("🔄 Room active détectée, tentative de reconnexion:", pendingRoomId);
          eventBus.emit("student:attempt-reconnect", { roomId: pendingRoomId, partner });
        }
      }
     break;

    case "TRANSPORT_CLOSED":
  eventBus.emit("socket:close");
  eventBus.emit("ws:status", { status: "reconnecting" });
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

    // ✅ Si invitation en attente, vérifier que l'invitant est en ligne
    if (AppState.pendingInviteId) {
        const invitant = (data.students || []).find(
            s => String(s.id) === String(AppState.pendingInviteId)
        );
        if (invitant) {
            Logger.log("🔗 Invitant trouvé en ligne :", invitant.prenom);
            AppState.pendingInviteId = null;
            eventBus.emit("invite:found", { invitant });
        }
    }
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

      
 // APRÈS — matchFound ne porte plus "initiator" comme donnée exploitée
case "student:matchFound":
case "student:match-found":
  AppState.isQueueing = false;
  AppState.partnerName = data.partnerName || "Partenaire";
  StudentSessionStorage.savePartner({
    partnerName: data.partnerName,
    partnerVille: data.partnerVille || "",
    partnerPays:  data.partnerPays  || "",
  });
  eventBus.emit("student:match-found", {
    roomId:    data.roomId,
    partnerName: data.partnerName,
    partnerVille: data.partnerVille || "",
    partnerPays:  data.partnerPays  || "",
  });
  break;

    // ==================================================
    // 🔒 SESSION
    // ==================================================

      case "student:joined-room":
      case "student:joinedRoom":
      StudentSessionStorage.save(data.roomId);
      eventBus.emit("student:joined-room", {
        roomId: data.roomId,
        reconnected: data.reconnected || false,
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
    Logger.log("📡 Le partenaire a quitté — cleanup session étudiant");
    StudentSessionStorage.clear();

      AppState.endSession();
      AppState.partnerName = null;
      AppState.currentCall = null;
  // Repasse uniquement le bébé à l'orchestrateur via l'eventBus
      eventBus.emit("ui:callState", { state: "idle" });
       
       eventBus.emit("student:user-left", {
        userId: data.userId,
        reason: data.reason || null,
      });
     break;
     case "student:peerDisconnected":
      Logger.log("⏳ Partenaire déconnecté, grâce de reconnexion en cours...");
      eventBus.emit("student:peer-disconnected", {
        userId: data.userId,
        userName: data.userName,
        graceSeconds: data.graceSeconds,
      });
      break;
      case "student:peerReconnected":
      Logger.log("✅ Partenaire reconnecté !");
      eventBus.emit("student:peer-reconnected", {
        userId: data.userId,
        userName: data.userName,
      });
      break;

    // APRÈS — événement dédié, toujours émis, aucune garde fragile
     case "student:session-ready":
     case "student:sessionReady":
  Logger.log("📡 Sockets : Session prête, initiateur :", data.initiator);
  eventBus.emit("student:session-ready", {
    roomId:    data.roomId,
    initiator: data.initiator,
    renegotiate: data.renegotiate || false,
  });
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
  const monId = AppState.currentUser?.id;
  const monNomComplet = `${AppState.currentUser?.prenom || ""} ${AppState.currentUser?.nom || ""}`.trim();

  // 🛡️ Filtre anti-écho : ne peut fonctionner que si le serveur fournit
  // un identifiant fiable (userId ou sender). Si les deux sont absents,
  // on ne peut pas déterminer l'origine du message avec certitude —
  // on logue un avertissement pour signaler ce cas côté backend.
  const hasIdentity = Boolean(data.userId) || Boolean(data.sender);
  if (!hasIdentity) {
    Logger.warn("⚠️ student:chatMessage reçu sans sender/userId — impossible de filtrer l'écho de façon fiable. Le backend doit fournir un identifiant.");
  }

  const vientDeMoi = hasIdentity && (
    (data.userId && data.userId === monId) ||
    (data.sender === monNomComplet)
  );

  if (vientDeMoi) {
    Logger.log("🚫 Mon propre message est revenu du serveur (Ignoré pour éviter le doublon)");
    break;
  }

  // 🛡️ Fallback d'affichage : si le serveur n'a pas transmis de nom,
  // on utilise le nom du partenaire déjà connu côté client (matchFound/sessionReady)
  // plutôt que d'afficher "undefined".
  const displayName = data.sender || data.userName || AppState.partnerName || "Partenaire";

  Logger.log(`✏️ Message reçu de l'autre utilisateur (${displayName}), affichage à l'écran.`);
  eventBus.emit("chat:message", {
    sender: displayName,
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
     case "student:invited":
    Logger.log("🔗 Invitation reçue de :", data.fromName);
    eventBus.emit("student:invited", {
        fromId:   data.fromId,
        fromName: data.fromName,
        matiere:  data.matiere,
    });
    break;
// ==================================================
// console.error("❌ ERREUR SERVEUR");
// ==================================================

case "error":
  if (data.code === "NOT_IDENTIFIED") {
    Logger.warn("⚠️ Identify pas encore traité côté serveur, nouvelle tentative dans 500ms");
    eventBus.emit("matching:retry-enqueue");
    break;
  }
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
