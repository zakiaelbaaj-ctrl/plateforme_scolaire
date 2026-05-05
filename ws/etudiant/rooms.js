// ws/etudiant/rooms.js
import { safeSend } from "../utils.js";
import { StudentMatchService } from "./match.service.js";
import { MatchRegistry } from "./match.registry.js";

const rooms = new Map(); // roomId -> { members: ws[], memberSet: Set }

// =======================================================
// JOIN ROOM
// =======================================================
export async function joinRoom(ws, { roomId }) {
    console.log("🚪 [étudiant] joinRoom:", ws.userId, "→", roomId);

    if (!roomId || !ws.userId)
        return safeSend(ws, { type: "error", message: "roomId requis" });

    if (ws.subscriptionStatus !== "active")
        return safeSend(ws, { type: "error", code: "NO_SUBSCRIPTION", message: "Abonnement requis." });

    if (!MatchRegistry.exists(roomId))
        return safeSend(ws, { type: "error", message: "Room introuvable." });

    if (!MatchRegistry.isAllowed(roomId, ws.userId))
        return safeSend(ws, { type: "error", message: "Accès non autorisé." });

    if (!rooms.has(roomId))
        rooms.set(roomId, { members: [], memberSet: new Set() });

    const room = rooms.get(roomId);

    // Idempotent — éviter le double ajout
    if (room.memberSet.has(ws)) return;

    if (room.members.length >= 2) {
        ws.studentRoomId = null;
        return safeSend(ws, { type: "error", message: "Room pleine." });
    }

    room.members.push(ws);
    room.memberSet.add(ws);
    ws.studentRoomId = roomId;

    broadcastRoom(roomId, {
        type:      "student:userJoined",
        userId:    ws.userId,
        userName:  `${ws.prenom} ${ws.nom}`,
        roomId,
        timestamp: new Date().toISOString()
    }, ws);

    safeSend(ws, { type: "student:joinedRoom", roomId });

    if (room.members.length === 2) {
        console.log(`🎬 [étudiant] Room complète: ${roomId}`);

        const [first, second] = room.members; // ordre d'arrivée garanti

        // Le SECOND crée l'offer (le premier est déjà prêt à recevoir)
        safeSend(first,  { type: "student:sessionReady", roomId, initiator: false });
        safeSend(second, { type: "student:sessionReady", roomId, initiator: true  });

        console.log(`🎯 Initiateur: user ${second.userId} (${second.prenom})`);
        console.log(`🎯 Receveur:   user ${first.userId}  (${first.prenom})`);
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
        room.members = room.members.filter(m => m !== ws);
        room.memberSet.delete(ws);

        console.log(`👤 [étudiant] ${ws.prenom} a quitté ${roomId}`);

        broadcastRoom(roomId, {
            type:     "student:userLeft",
            userId:   ws.userId,
            userName: `${ws.prenom} ${ws.nom}`
        });

        if (room.members.length === 0) {
            rooms.delete(roomId);
            MatchRegistry.unregister(roomId);
            console.log(`🗑️ [étudiant] Room supprimée: ${roomId}`);
        }
    }

    ws.studentRoomId = null;
}

// =======================================================
// SIGNALISATION WebRTC
// =======================================================
export function relaySignal(ws, { roomId, signal }) {
    if (!roomId || !signal || ws.studentRoomId !== roomId) return;

    const allowed = ["offer", "answer", "ice-candidate"];
    if (!allowed.includes(signal.type)) return;

    broadcastRoom(roomId, {
        type:   "student:signal",
        from:   ws.userId,
        signal
    }, ws);
}

// =======================================================
// UTILS
// =======================================================
export function broadcastRoom(roomId, payload, except = null) {
    const room = rooms.get(roomId);
    if (!room) return;

    for (const client of room.members) {
        if (client !== except && client.readyState === 1) {
            safeSend(client, payload);
        }
    }
}

export function getRooms() { return rooms; }

export function getRoomSize(roomId) {
    const room = rooms.get(roomId);
    return room ? room.members.length : 0; // ✅ .length et non .size
}