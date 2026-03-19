// =======================================================
// WS.ROOMS.JS – Gestion des rooms et chat
// Séparation des responsabilités
// =======================================================

import { safeSend } from "./utils.js";
import { TwilioService } from "./twilio.service.js";

const rooms = new Map();  // roomId -> Set<ws>

// =======================================================
// JOIN ROOM
// =======================================================
export async function joinRoom(ws, { roomId }, onlineProfessors, clients) {

  console.log("🚪 joinRoom appelé pour:", ws.userId, "room:", roomId);

  // =======================================================
  // 1️⃣ Validation
  // =======================================================
  if (!roomId || !ws.userId) {
    return safeSend(ws, {
      type: "error",
      message: "roomId requis"
    });
  }

  // =======================================================
  // 2️⃣ 🔒 RÈGLE 1 : empêcher double join STRICT
  // =======================================================
  if (ws.roomId === roomId) {
    console.log(`⚠️ ${ws.userId} déjà dans ${roomId} → ignore`);
    return;
  }

  // =======================================================
  // 3️⃣ 🔒 RÈGLE 2 : quitter ancienne room AVANT
  // =======================================================
  if (ws.roomId) {
    leaveRoom(ws);
  }

  // =======================================================
  // 4️⃣ Rejoindre la nouvelle room
  // =======================================================
  ws.roomId = roomId;

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }

  if (rooms.get(roomId).size >= 2) {
    ws.roomId = null; // rollback
    return safeSend(ws, {
      type: "error",
      message: "Room pleine"
    });
  }

  rooms.get(roomId).add(ws);
  console.log("📊 Contenu room après ajout:", roomId, "=>", [...rooms.get(roomId)].map(c => c.userId));
  console.log(`👤 ${ws.userName} a rejoint ${roomId}`);

  // =======================================================
  // 5️⃣ Notifier les autres
  // =======================================================
  broadcastRoom(roomId, {
    type: "userJoined",
    userId: ws.userId,
    userName: ws.userName,
    roomId,
    timestamp: new Date().toISOString()
  }, ws); // exclude sender

  // =======================================================
  // 6️⃣ Confirmer au client
  // =======================================================
  safeSend(ws, {
    type: "joinedRoom",
    roomId,
    timestamp: new Date().toISOString()
  });

  console.log("✅ joinedRoom envoyé:", ws.userId);
// =======================================================
// 7️⃣ Si room complète (2 participants) → Twilio
// =======================================================
const currentRoom = rooms.get(roomId);

// ✅ Ajouter dans la section 7️⃣ de joinRoom
if (currentRoom?.size === 2) {
  console.log(`🎬 Room complète: ${roomId} → démarrage Twilio`);
  console.log(`👥 Participants:`, [...currentRoom].map(p => ({
    userId: p.userId,
    role:   p.role,
    userName: p.userName
  })));

  try {
    await TwilioService.createRoom(roomId);
    console.log(`✅ Room Twilio créée: ${roomId}`);
  } catch(err) {
    console.error(`❌ Erreur createRoom:`, err);
  }

  for (const participant of currentRoom) {
    const role  = participant.role || "eleve";
    console.log(`🎫 Génération token pour: ${participant.userId} (${role})`);

    try {
      const token = TwilioService.generateToken(participant.userId, role, roomId);
      console.log(`✅ Token généré pour: ${participant.userId}`);

      safeSend(participant, {
        type:     "twilioToken",
        token,
        roomName: roomId
      });

      console.log(`📤 twilioToken envoyé à: ${participant.userId} (${role})`);
    } catch(err) {
      console.error(`❌ Erreur generateToken pour ${participant.userId}:`, err);
    }
  }
}
}
// =======================================================
// CHAT MESSAGE
// =======================================================
export function chatMessage(ws, { roomId, text }) {

  console.log("📩 chatMessage reçu:", {
    from:          ws.userId,
    wsRoomId:      ws.roomId,
    payloadRoomId: roomId,
    text
  });

  if (!roomId || !text || typeof text !== "string") {
    return safeSend(ws, {
      type:    "error",
      message: "roomId et text requis"
    });
  }

  const cleanText = text.trim().substring(0, 2000);
  if (!cleanText) return;

  console.log("🔎 Vérification room:", {
    wsUser:        ws.userId,
    wsRoomId:      ws.roomId,
    payloadRoomId: roomId
  });

  if (ws.roomId !== roomId) {
    return safeSend(ws, {
      type:    "error",
      message: "Vous n'êtes pas dans cette room"
    });
  }

  broadcastRoom(roomId, {
    type:      "chatMessage",
    messageId: `${ws.userId}_${Date.now()}`,
    userId:    ws.userId,
    sender:    ws.userName,
    userName:  ws.userName,
    text:      cleanText,
    timestamp: new Date().toISOString()
  });

  console.log(`💬 Message dans ${roomId} par ${ws.userName}`);
}
// =======================================================
// DOCUMENT SHARING
// =======================================================
export function documentShare(ws, { roomId, fileName, fileData }) {
  console.log("📄 DEBUG documentShare:", {
    userId: ws.userId,
    userName: ws.userName,
    prenom: ws.prenom,
    nom: ws.nom
  });
  if (!roomId || !fileData) {
    return safeSend(ws, {
      type: "error",
      message: "roomId et fileData requis"
    });
  }
  if (ws.roomId !== roomId) {
  return safeSend(ws, {
    type: "error",
    message: "Vous n'êtes pas dans cette room"
  });
}
  // Validation taille
  const maxSize = 10 * 1024 * 1024;  // 10MB
  if (fileData.length > maxSize) {
    return safeSend(ws, {
      type: "error",
      message: "Fichier trop volumineux (max 10MB)"
    });
  }
 // ================= DEBUG ICI =================
console.log("📄 DEBUG documentShare:", {
  userId: ws.userId,
  userName: ws.userName,
  prenom: ws.prenom,
  nom: ws.nom
});
// =============================================
  broadcastRoom(roomId, {
  type: "document",
  
  userId: ws.userId,
  userName: ws.userName && ws.userName.trim() !== ""

    ? ws.userName
    : ws.prenom || ws.userId || "Utilisateur",
  fileName: fileName || "document",
  fileData,
  timestamp: new Date().toISOString()
}, ws);
  console.log(`📄 Document partagé: ${fileName} dans ${roomId}`);
}

// =======================================================
// LEAVE ROOM (auto-call on disconnect)
// =======================================================
export function leaveRoom(ws) {
  if (!ws.roomId) return;

  const room = rooms.get(ws.roomId);
  if (room) {
    room.delete(ws);

    // Notifier les autres
    broadcastRoom(ws.roomId, {
      type: "userLeft",
      userId: ws.userId,
      userName: ws.userName,
      timestamp: new Date().toISOString()
    });

    // Supprimer la room si vide
    if (room.size === 0) {
      rooms.delete(ws.roomId);
      console.log(`🗑️ Room supprimée: ${ws.roomId}`);
    }
  }

  ws.roomId = null;
}

// =======================================================
// BROADCAST UTILS
// =======================================================
export function broadcastRoom(roomId, payload, except = null) {
  const room = rooms.get(roomId);

  if (!room || room.size === 0) {
    console.log("📡 broadcastRoom", roomId, "AUCUN participant");
    return;
  }

  console.log("📡 broadcastRoom", roomId, "participants:", room.size);

  for (const client of room) {
    if (client !== except && client.readyState === 1) {
      safeSend(client, payload);
    }
  }
}
export function getRooms() {
  return rooms;
}

export function getRoomSize(roomId) {
  const room = rooms.get(roomId);
  return room ? room.size : 0;
}
