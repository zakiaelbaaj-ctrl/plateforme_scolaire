// ws/etudiant/rooms.js
// ✅ Gestion des rooms étudiant-étudiant
// ❌ Pas de Twilio, pas de Stripe — accès garanti par l'abonnement (vérifié en amont)

import { safeSend } from "../utils.js";
import { StudentMatchService } from "./match.service.js";
import { MatchRegistry } from "./match.registry.js";

const rooms = new Map(); // roomId -> Set<ws>

// =======================================================
// JOIN ROOM
// =======================================================
export async function joinRoom(ws, { roomId }) {
    console.log("🚪 [étudiant] joinRoom:", ws.userId, "→", roomId);

    if (!roomId || !ws.userId) {
        return safeSend(ws, { type: "error", message: "roomId requis" });
    }

    // Vérification abonnement actif
    if (ws.subscriptionStatus !== "active") {
        return safeSend(ws, {
            type: "error",
            code: "NO_SUBSCRIPTION",
            message: "Abonnement requis pour accéder aux sessions étudiantes."
        });
    }

    // La room doit avoir été créée par le match service
    if (!MatchRegistry.exists(roomId)) {
        return safeSend(ws, { type: "error", message: "Room introuvable." });
    }

    // Vérifier que cet étudiant est bien autorisé dans cette room
    if (!MatchRegistry.isAllowed(roomId, ws.userId)) {
        return safeSend(ws, { type: "error", message: "Accès non autorisé à cette room." });
    }

    // Ne pas bloquer si la room n'est pas encore dans le Set
if (ws.studentRoomId === roomId && rooms.get(roomId)?.has(ws)) return;

    ws.studentRoomId = roomId;

    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }

    const currentRoom = rooms.get(roomId);

    if (currentRoom.size >= 2) {
        ws.studentRoomId = null;
        return safeSend(ws, { type: "error", message: "Room pleine." });
    }

    currentRoom.add(ws);

    // Informer l'autre participant
    broadcastRoom(roomId, {
        type: "student:userJoined",
        userId: ws.userId,
        userName: `${ws.prenom} ${ws.nom}`,
        roomId,
        timestamp: new Date().toISOString()
    }, ws);

    safeSend(ws, { type: "student:joinedRoom", roomId });

    // =======================================================
    // SESSION COMPLÈTE (2 étudiants) → signalement prêt
    // Pas de Twilio : le client gère WebRTC en peer-to-peer
    // Le premier arrivé sera l'initiateur de l'offre WebRTC
    // =======================================================
    if (currentRoom.size === 2) {
        console.log(`🎬 [étudiant] Room complète: ${roomId}`);

        const [first, second] = [...currentRoom];

        // Le premier connecté initie l'offre WebRTC
        safeSend(first, {
            type: "student:sessionReady",
            roomId,
            initiator: true   // → ce client envoie l'offer WebRTC
        });

        safeSend(second, {
            type: "student:sessionReady",
            roomId,
            initiator: false  // → ce client attend l'offer
        });
    }
}

// =======================================================
// LEAVE ROOM
// =======================================================
export async function leaveRoom(ws) {
    let roomId = ws.studentRoomId;
    if (typeof roomId === "object" && roomId !== null) roomId = roomId.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (room) {
        room.delete(ws);
        console.log(`👤 [étudiant] ${ws.prenom} a quitté ${roomId}`);

        broadcastRoom(roomId, {
            type: "student:userLeft",
            userId: ws.userId,
            userName: `${ws.prenom} ${ws.nom}`
        });

        // Nettoyage quand la room se vide
        // Pas de Stripe, pas de durée à calculer
        if (room.size === 0) {
            rooms.delete(roomId);
            MatchRegistry.unregister(roomId);
            console.log(`🗑️ [étudiant] Room supprimée: ${roomId}`);
        }
    }

    ws.studentRoomId = null;
}

// =======================================================
// SIGNALISATION WebRTC
// Relaie offer / answer / ice-candidate entre les deux pairs
// Le serveur ne lit pas le contenu du signal, il le transmet juste
// =======================================================
export function relaySignal(ws, { roomId, signal }) {
    if (!roomId || !signal || ws.studentRoomId !== roomId) return;

    // Valider le type de signal autorisé
    const allowed = ["offer", "answer", "ice-candidate"];
    if (!allowed.includes(signal.type)) return;

    broadcastRoom(roomId, {
        type: "student:signal",
        from: ws.userId,
        signal
    }, ws); // ws exclu → va uniquement à l'autre pair
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

export function getRooms() { return rooms; }

export function getRoomSize(roomId) {
    const room = rooms.get(roomId);
    return room ? room.size : 0;
}