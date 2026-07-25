import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

class LiveKitServiceClass {
    constructor() {
        const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;

        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
            console.error("❌ [CRITICAL] Variables d'environnement LiveKit manquantes !");
        }

        this.url = LIVEKIT_URL;
        this.apiKey = LIVEKIT_API_KEY;
        this.apiSecret = LIVEKIT_API_SECRET;

        this.roomService = new RoomServiceClient(this.url, this.apiKey, this.apiSecret);
    }

    /**
     * 1️⃣ CRÉATION DE ROOM
     */
    async createRoom(roomId) {
        try {
            console.log(`📡 LiveKit → Tentative de création de la room: ${roomId}`);

            const room = await this.roomService.createRoom({
                name: roomId,
                emptyTimeout: 5 * 60,        // 5 minutes (secondes)
                maxParticipants: 2,
                departureTimeout: 5 * 60,    // ferme la room 5 min après le départ du dernier participant
            });

            console.log(`✅ LiveKit → Room créée avec succès (SID: ${room.sid})`);
            return room;

        } catch (err) {
            // La room existe déjà → succès déguisé, comme avec Twilio 53113
            if (err.message?.includes("already exists") || err.status === 409) {
                console.log(`ℹ️ LiveKit → La room "${roomId}" est déjà active.`);
                return { name: roomId };
            }

            console.error("❌ LiveKit → ÉCHEC FATAL:", err.status, err.message);
            throw err;
        }
    }

    /**
     * 2️⃣ SUPPRESSION DE ROOM
     */
    async deleteRoom(roomId) {
        try {
            console.log(`🗑️ LiveKit → Clôture de la room: ${roomId}`);
            await this.roomService.deleteRoom(roomId);
            console.log(`✅ LiveKit → Room "${roomId}" fermée.`);
            return true;
        } catch (err) {
            console.warn(`⚠️ LiveKit → Impossible de fermer la room: ${err.message}`);
            return false;
        }
    }

    /**
     * 3️⃣ GÉNÉRATION DE TOKEN
     */
    async generateToken(userId, role, roomId) {
        try {
            const identity = role === "prof" ? `prof_${userId}` : `student_${userId}`;

            const at = new AccessToken(this.apiKey, this.apiSecret, {
                identity,
                ttl: "4h",
            });

            at.addGrant({
                room: roomId,
                roomJoin: true,
                canPublish: true,
                canSubscribe: true,
                canPublishData: true,
            });

            const token = await at.toJwt();
            console.log(`🎫 LiveKit → Token généré pour: ${identity}`);
            return token;
        } catch (err) {
            console.error("❌ LiveKit → Erreur Token:", err.message);
            return null;
        }
    }
}

export const LiveKitService = new LiveKitServiceClass();