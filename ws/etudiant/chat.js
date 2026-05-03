// ws/etudiant/chat.js
// ✅ Chat entre étudiants dans une room peer
// Identique au chat prof-élève mais utilise studentRoomId

import { broadcastRoom } from "./rooms.js";

export function chatMessage(ws, { roomId, text }) {
    if (!roomId || !text) return;

    // Sécurité : l'étudiant doit être dans cette room
    if (ws.studentRoomId !== roomId) return;

    broadcastRoom(roomId, {
        type: "student:chatMessage",
        userId: ws.userId,
        sender: `${ws.prenom} ${ws.nom}`,
        text: text.trim().substring(0, 2000),
        timestamp: new Date().toISOString()
    });
}