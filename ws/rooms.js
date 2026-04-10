// ws/rooms.js
// ✅ On utilise le service de paiement robuste
import * as StripeService from "../services/payment.service.js";
import { safeSend } from "./utils.js";
import { TwilioService } from "./twilio.service.js";

const rooms = new Map();       // roomId -> Set<ws>
const sessionData = new Map();  // roomId -> { startTime: Date, participants: [] }

// =======================================================
// JOIN ROOM
// =======================================================
export async function joinRoom(ws, { roomId }, onlineProfessors, clients) {
    console.log("🚪 joinRoom appelé pour:", ws.userId, "room:", roomId);

    if (!roomId || !ws.userId) {
        return safeSend(ws, { type: "error", message: "roomId requis" });
    }

    if (ws.roomId === roomId) return;
    if (ws.roomId) await leaveRoom(ws); 

    ws.roomId = roomId;

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }

    const currentRoom = rooms.get(roomId);

    if (currentRoom.size >= 2) {
        ws.roomId = null;
        return safeSend(ws, { type: "error", message: "Room pleine" });
    }

    currentRoom.add(ws);
    
    broadcastRoom(roomId, {
        type: "userJoined",
        userId: ws.userId,
        userName: ws.userName,
        roomId,
        timestamp: new Date().toISOString()
    }, ws);

    safeSend(ws, { type: "joinedRoom", roomId });

    // =======================================================
    // 🎬 SESSION COMPLÈTE (2) -> TWILIO & CHRONO
    // =======================================================
    if (currentRoom.size === 2) {
        console.log(`🎬 Room complète: ${roomId} → Démarrage session`);

        sessionData.set(roomId, {
            startTime: new Date(),
            participants: [...currentRoom].map(p => ({ 
                userId: p.userId, 
                role: p.role, 
                userName: p.userName 
            }))
        });

        try {
            await TwilioService.createRoom(roomId);
        } catch (err) {
            console.error(`❌ Erreur Twilio Service:`, err.message);
        }

        for (const participant of currentRoom) {
            const role = participant.role || "eleve";
            const token = TwilioService.generateToken(participant.userId, role, roomId);
            
            safeSend(participant, {
                type: "twilioToken",
                token,
                roomName: roomId
            });
        }
    }
}

// =======================================================
// LEAVE ROOM
// =======================================================
export async function leaveRoom(ws) {
    // 1. Sécurité sur l'ID de la room
    let roomId = ws.roomId;
    if (typeof roomId === 'object' && roomId !== null) roomId = roomId.roomId; 
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
        room.delete(ws);
        console.log(`👤 ${ws.userName} a quitté ${roomId}`);

        broadcastRoom(roomId, {
            type: "userLeft",
            userId: ws.userId,
            userName: ws.userName
        });

        // 💰 NETTOYAGE SESSION
        const data = sessionData.get(roomId);
        
        if (data && room.size < 2) {
            // Supprimer les données pour éviter les doublons
            sessionData.delete(roomId); 

            const endTime = new Date();
            const durationMin = Math.ceil((endTime - data.startTime) / 60000);
            console.log(`🏁 FIN DE SESSION: ${roomId}. Durée estimée: ${durationMin} min.`);

            // NOTE: La facturation Stripe est désormais déclenchée par visio.js 
            // dès que le message 'visioDuration' est reçu de l'élève.

            // 2. Fermer la room Twilio
            try {
                await TwilioService.deleteRoom(roomId);
            } catch (err) {
                console.warn("ℹ️ Twilio Room déjà fermée.");
            }
        }

        if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Salon supprimé: ${roomId}`);
        }
    }

    ws.roomId = null;
}

// =======================================================
// CHAT & DOCUMENTS
// =======================================================
export function chatMessage(ws, { roomId, text }) {
    if (!roomId || !text || ws.roomId !== roomId) return;
    
    broadcastRoom(roomId, {
        type: "chatMessage",
        userId: ws.userId,
        sender: ws.userName,
        text: text.trim().substring(0, 2000),
        timestamp: new Date().toISOString()
    });
}

export function documentShare(ws, { roomId, fileName, fileData }) {
    if (!roomId || !fileData || ws.roomId !== roomId) return;

    broadcastRoom(roomId, {
        type: "document",
        userId: ws.userId,
        userName: ws.userName || "Utilisateur",
        fileName: fileName || "document",
        fileData,
        timestamp: new Date().toISOString()
    }, ws);
}

// =======================================================
// UTILS
// =======================================================
export function broadcastRoom(roomId, payload, except = null) {
    const room = rooms.get(roomId);
    if (!room) return;

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