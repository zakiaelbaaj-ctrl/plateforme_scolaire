// ws/etudiant/documents.js
// ✅ Partage de fichiers entre étudiants dans une room peer

import { broadcastRoom } from "./rooms.js";

export function documentShare(ws, { roomId, fileName, fileData }) {
    if (!roomId || !fileData) return;

    // Sécurité : l'étudiant doit être dans cette room
    if (ws.studentRoomId !== roomId) return;

    broadcastRoom(roomId, {
        type: "student:document",
        userId: ws.userId,
        userName: `${ws.prenom} ${ws.nom}`,
        fileName: fileName || "document",
        fileData,
        timestamp: new Date().toISOString()
    }, ws); // ws exclu → l'expéditeur a déjà son fichier
}