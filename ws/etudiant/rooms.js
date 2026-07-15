// ws/etudiant/rooms.js
import { safeSend } from "../utils.js";
import { StudentMatchService } from "./match.service.js";
import { MatchRegistry } from "./match.registry.js";

const GRACE_PERIOD_MS = 45000; // 🟢 délai pour se reconnecter

const rooms = new Map(); // roomId -> { members: ws[], memberSet: Set }

function getDisplayName(ws) {
  const full = `${ws.prenom || ""} ${ws.nom || ""}`.trim();
  return full || `Étudiant #${ws.userId}`;
}
// =======================================================
// JOIN ROOM (gère aussi bien un 1er join qu'une reconnexion)
// =======================================================
export async function joinRoom(ws, { roomId }) {
    console.log("🚪 [étudiant] joinRoom:", ws.userId, "→", roomId);

    if (!roomId || !ws.userId)
        return safeSend(ws, { type: "error", message: "roomId requis" });

    const DEV_FORCE_SUBSCRIPTION = true; // ← mettre false en prod
    if (!DEV_FORCE_SUBSCRIPTION && ws.subscriptionStatus !== "active")
    return safeSend(ws, { type: "error", code: "NO_SUBSCRIPTION", message: "Abonnement requis." });
   
    if (!MatchRegistry.exists(roomId))
        return safeSend(ws, { type: "error", message: "Room introuvable." });

    if (!MatchRegistry.isAllowed(roomId, ws.userId))
        return safeSend(ws, { type: "error", message: "Accès non autorisé." });

    if (!rooms.has(roomId))
    rooms.set(roomId, { members: [], memberSet: new Set(), disconnected: new Map() });

    const room = rooms.get(roomId);
    // 🟢 RECONNEXION : ce userId était marqué déconnecté dans cette room
    if (room.disconnected.has(ws.userId)) {
        const entry = room.disconnected.get(ws.userId);
        clearTimeout(entry.timer);
        room.disconnected.delete(ws.userId);

        room.members.push(ws);
        room.memberSet.add(ws);
        ws.studentRoomId = roomId;
        console.log(`🔄 [étudiant] ${ws.userId} reconnecté à ${roomId}`);

        broadcastRoom(roomId, {
            type: "student:peerReconnected",
            userId: ws.userId,
            userName: getDisplayName(ws),
            roomId,
        }, ws);
        safeSend(ws, { type: "student:joinedRoom", roomId, reconnected: true });

        // 🟢 Si les deux sont là, redéclencher la signalisation WebRTC
        if (room.members.length === 2) {
            const [first, second] = room.members;
            safeSend(first,  { type: "student:sessionReady", roomId, initiator: false, renegotiate: true });
            safeSend(second, { type: "student:sessionReady", roomId, initiator: true,  renegotiate: true });
        }
        return;
        }
    
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
        type: "student:userJoined",
        userId: ws.userId,
        userName: getDisplayName(ws),
        roomId,
        timestamp: new Date().toISOString()
    }, ws);

    safeSend(ws, { type: "student:joinedRoom", roomId });

    if (room.members.length === 2) {
        console.log(`🎬 [étudiant] Room complète: ${roomId}`);
        const [first, second] = room.members;
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
        room.disconnected.delete(ws.userId); // au cas où il était en attente de grâce


        console.log(`👤 [étudiant] ${getDisplayName(ws)} a quitté ${roomId}`);

        broadcastRoom(roomId, {
    type:     "student:userLeft",
    userId:   ws.userId,
    userName: getDisplayName(ws)     // ✅ plus de "null null"
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
// 🟢 NOUVEAU : déconnexion INVOLONTAIRE (fermeture WS, réseau)
// Ne détruit pas la room tout de suite — période de grâce.
// =======================================================
export function handleUnexpectedDisconnect(ws) {
    let roomId = ws.studentRoomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    // Retire le ws mort des membres actifs
    room.members = room.members.filter(m => m !== ws);
    room.memberSet.delete(ws);

    console.log(`⏳ [étudiant] ${getDisplayName(ws)} déconnecté de ${roomId} — grâce ${GRACE_PERIOD_MS / 1000}s`);

    broadcastRoom(roomId, {
        type: "student:peerDisconnected",
        userId: ws.userId,
        userName: getDisplayName(ws),
        graceSeconds: GRACE_PERIOD_MS / 1000
    });

    const timer = setTimeout(() => {
        room.disconnected.delete(ws.userId);
        console.log(`🏁 [étudiant] Grâce expirée pour ${ws.userId} → fin définitive ${roomId}`);

        broadcastRoom(roomId, {
            type: "student:userLeft",
            userId: ws.userId,
            userName: getDisplayName(ws),
            reason: "timeout"
        });

        if (room.members.length === 0) {
            rooms.delete(roomId);
            MatchRegistry.unregister(roomId);
            console.log(`🗑️ [étudiant] Room supprimée (timeout): ${roomId}`);
        }
    }, GRACE_PERIOD_MS);
    room.disconnected.set(ws.userId, { timer, userName: getDisplayName(ws) });

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
