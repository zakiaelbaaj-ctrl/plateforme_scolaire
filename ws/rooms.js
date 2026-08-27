// ws/rooms.js
// ✅ On utilise le service de paiement robuste
import * as StripeService from "../services/payment.service.js";
import { safeSend } from "./utils.js";
import { LiveKitService } from "./livekit.service.js";

const rooms = new Map();       // roomId -> Set<ws>
const sessionData = new Map();  // roomId -> { startTime: Date, participants: [] }
const disconnected = new Map(); // roomId -> Map(userId -> { timer, role })

const GRACE_PERIOD_MS = 90000; // ✅ 90s — laisse le temps de changer de fenêtre/consulter un fichier

// =======================================================
// JOIN ROOM
// =======================================================
export async function joinRoom(ws, { roomId }, onlineProfessors, clients) {
    console.log("🚪 joinRoom appelé pour:", ws.userId, "room:", roomId);

    if (!roomId || !ws.userId) {
        return safeSend(ws, { type: "error", message: "roomId requis" });
    }

    // ✅ NOUVEAU — reconnexion pendant la grâce
        const roomDisc = disconnected.get(roomId);
    if (roomDisc?.has(ws.userId)) {
        const entry = roomDisc.get(ws.userId);
        clearTimeout(entry.timer);
        roomDisc.delete(ws.userId);
        if (roomDisc.size === 0) disconnected.delete(roomId);

        console.log(`🔄 ${ws.userId} reconnecté à ${roomId} (grâce annulée)`);

        ws.roomId = roomId;
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);

        broadcastRoom(roomId, {
            type: "peerReconnected",
            userId: ws.userId,
            userName: ws.userName
        }, ws);
        safeSend(ws, { type: "joinedRoom", roomId, reconnected: true });

        const currentRoom = rooms.get(roomId);
        if (currentRoom.size === 2) {
            for (const participant of currentRoom) {
                const role = participant.role || "eleve";
                try {
                    const token = await LiveKitService.generateToken(participant.userId, role, roomId);
                    safeSend(participant, {
                        type: "livekitToken",
                        token,
                        roomName: roomId,
                        url: process.env.LIVEKIT_URL
                    });
                } catch (err) {
                    console.error("❌ Erreur régénération token LiveKit (reconnexion):", err.message);
                }
            }
        }
        return;   // ✅ on sort ici, la ligne suivante `if (ws.roomId === roomId) return;` n'est jamais atteinte dans ce cas
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
            await LiveKitService.createRoom(roomId);
        } catch (err) {
            console.error(`❌ Erreur Twilio Service:`, err.message);
        }

        for (const participant of currentRoom) {
            const role = participant.role || "eleve";
            const token = await LiveKitService.generateToken(participant.userId, role, roomId);
            
            safeSend(participant, {
    type: "livekitToken",
    token,
    roomName: roomId,
    url: process.env.LIVEKIT_URL  // ajoutez l'URL, le client en aura besoin pour se connecter
});
        }
    }
}

// =======================================================
// LEAVE ROOM— fin VOLONTAIRE / DÉFINITIVE (inchangé)
// À n'appeler que lors d'une vraie fin de session, jamais
// sur une simple coupure WS.
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
                await LiveKitService.deleteRoom(roomId);
            } catch (err) {
                console.warn("ℹ️ Twilio Room déjà fermée.");
            }
        }

        if (room.size === 0) {
            rooms.delete(roomId);
            console.log(`🗑️ Salon supprimé: ${roomId}`);
        }
    }
    disconnected.delete(roomId); // au cas où une grâce était en cours
    ws.roomId = null;
}
// =======================================================
// ✅ NOUVEAU — déconnexion INVOLONTAIRE (fermeture WS, réseau,
// changement de fenêtre iPad, etc.). Ne détruit ni la room ni
// la session tout de suite — période de grâce.
// =======================================================
export function handleUnexpectedDisconnect(ws, { onGraceExpired } = {}) {
    let roomId = ws.roomId;
    if (!roomId) return;

    const room = rooms.get(roomId);
    if (!room) return;

    room.delete(ws); // retire le socket mort, la room "logique" reste ouverte

    console.log(`⏳ ${ws.userName} (${ws.role}) déconnecté de ${roomId} — grâce ${GRACE_PERIOD_MS / 1000}s`);

    broadcastRoom(roomId, {
        type: "peerDisconnected",
        userId: ws.userId,
        userName: ws.userName,
        graceSeconds: GRACE_PERIOD_MS / 1000
    });
    if (!disconnected.has(roomId)) disconnected.set(roomId, new Map());

    const timer = setTimeout(() => {
        const roomDisc = disconnected.get(roomId);
        roomDisc?.delete(ws.userId);
        if (roomDisc && roomDisc.size === 0) disconnected.delete(roomId);

        console.log(`🏁 Grâce expirée pour ${ws.userId} → fin définitive ${roomId}`);
        // ✅ Délègue la vraie fermeture (facturation, session:stop, LiveKit)
        // au code appelant, qui connaît le contexte prof/élève complet.
        if (typeof onGraceExpired === "function") {
            onGraceExpired();
        }
    }, GRACE_PERIOD_MS);

    disconnected.get(roomId).set(ws.userId, { timer, role: ws.role });

    // ⚠️ On NE remet PAS ws.roomId à null ici : on veut pouvoir vérifier,
    // au moment de la reconnexion, à quelle room ce userId doit revenir.
    // (voir note d'intégration côté server.js ci-dessous)
}
export function isInGracePeriod(roomId, userId) {
    return disconnected.get(roomId)?.has(userId) ?? false;
}
// =======================================================
// ⚡ FIX : FORCE CLOSE ROOM (Avec avertissement aux clients)
// =======================================================
export function closeRoom(roomId, { notify = true } = {}) {
    if (!roomId) return;
    
    const room = rooms.get(roomId);
    if (room) {
        console.log(`🗑️ Fermeture et nettoyage forcé de la room : ${roomId}`);
        
        // 📣 On prévient l'élève et le prof de couper la visio IMMEDIATEMENT
        // (sauf si notify=false, car l'appelant a déjà envoyé son propre session:stop)
        for (const client of room) {
            if (notify && client.readyState === 1) {
                safeSend(client, { 
                    type: "session:stop", 
                    roomId 
                });
            }
            client.roomId = null; // Libère l'état du socket pour le prochain appel
        }
        
        rooms.delete(roomId);
    }
    sessionData.delete(roomId);
    // ✅ NOUVEAU — annule toute grâce en attente pour cette room,
    // pour éviter qu'un timer orphelin ne se déclenche après coup.
    const roomDisc = disconnected.get(roomId);
    if (roomDisc) {
        for (const entry of roomDisc.values()) clearTimeout(entry.timer);
        disconnected.delete(roomId);
    }
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
