// ws/etudiant/index.js
// Routeur principal des messages WebSocket côté étudiant-étudiant
// Exporté vers ws/etudiant/init.js qui l'écoute via wss.emit("ws:message")

import { joinRoom, leaveRoom }  from "./rooms.js";
import { documentShare }        from "./documents.js";
import { handleSignal }         from "./video.js";
import { StudentMatchService }  from "./match.service.js";
import { safeSend } from "../utils.js";
import { clients } from "../../socket.js";

// =======================================================
// HANDLER PRINCIPAL
// Appelé depuis ws/etudiant/init.js pour chaque message entrant
// ws   = connexion WebSocket du client
// msg  = message parsé { type, ...payload }
// =======================================================
export async function handleStudentMessage(ws, msg) {
    switch (msg.type) {
        case "student:getOnlineStudents":
        // déjà géré
         break;

        // --------------------------------------------------
        // MATCHING — file d'attente
        // --------------------------------------------------
        case "student:enqueue":
            StudentMatchService.enqueueStudent(
                ws,
                msg.matiere,
                msg.sujet,
                msg.niveau,
                msg.inviteId
            );
            break;

        case "student:dequeue":
            StudentMatchService.removeStudent(ws.userId);
            break;

        // --------------------------------------------------
        // ROOM — rejoindre après un match
        // --------------------------------------------------
        case "student:joinRoom":
        case "student:join-room":
            await joinRoom(ws, { roomId: msg.roomId });
            break;

        case "student:leaveRoom":
        case "student:leave-room":
            await leaveRoom(ws);
            break;

        // --------------------------------------------------
        // SIGNALISATION WebRTC
        // signal = { type: "offer" | "answer" | "ice-candidate", ... }
        // --------------------------------------------------
        case "student:signal":
            handleSignal(ws, {
                roomId: msg.roomId,
                signal: msg.signal
            });
            break;

        // --------------------------------------------------
        // CHAT
        // --------------------------------------------------
       case "student:chatMessage": {
  const { text, roomId } = msg;
  if (!text) {
    return safeSend(ws, { type: "error", message: "Message vide" });
  }

  const activeRoomId = roomId || ws.studentRoomId;
  if (!activeRoomId) {
    return safeSend(ws, { type: "error", message: "Aucune room active" });
  }

  // 🛡️ Fallback robuste : userName peut être undefined si identify()
  // n'a pas encore été traité côté serveur pour ce socket.
  const senderName =
    ws.userName ||
    `${ws.prenom || ""} ${ws.nom || ""}`.trim() ||
    `Étudiant #${ws.userId}`;

  const payload = {
    type: "student:chatMessage",
    userId: ws.userId,      // 👈 identifiant stable, toujours présent (jamais undefined)
    sender: senderName,     // 👈 ne peut plus jamais être undefined → jamais supprimé du JSON
    text,
    roomId: activeRoomId,
    timestamp: new Date().toISOString(),
  };

  // 🛡️ Diffusion restreinte aux membres de LA room, pas à tous les étudiants en ligne
  clients.forEach(client => {
    if (
      client.readyState === 1 &&
      client.role === "etudiant" &&
      client.studentRoomId === activeRoomId
    ) {
      client.send(JSON.stringify(payload));
    }
  });
  break;
}

        // --------------------------------------------------
        // DOCUMENTS
        // --------------------------------------------------
        case "student:documentShare":
            documentShare(ws, {
                roomId:   msg.roomId,
                fileName: msg.fileName,
                fileData: msg.fileData
            });
            break;

        default:
            break;
    }
}

// =======================================================
// CLEANUP — appelé depuis ws/etudiant/init.js à la déconnexion
// Retire l'étudiant de la file de matching ET nettoie sa room peer
// =======================================================
export async function handleStudentDisconnect(ws) {
    // Retirer de la file de matching si en attente
    StudentMatchService.removeStudent(ws.userId);

    // Quitter la room peer si en session
    if (ws.studentRoomId) {
        await leaveRoom(ws);
    }
}
