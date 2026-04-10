import Twilio from "twilio";

class TwilioServiceClass {
    constructor() {
        const { TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET } = process.env;

        if (!TWILIO_ACCOUNT_SID || !TWILIO_API_KEY || !TWILIO_API_SECRET) {
            console.error("❌ [CRITICAL] Variables d'environnement Twilio manquantes !");
        }

        this.client = Twilio(
            TWILIO_API_KEY,
            TWILIO_API_SECRET,
            { accountSid: TWILIO_ACCOUNT_SID }
        );

        this.AccessToken = Twilio.jwt.AccessToken;
        this.VideoGrant = this.AccessToken.VideoGrant;
    }

    /**
     * 1️⃣ CRÉATION DE ROOM "BLINDÉE"
     * Tente de créer la room avec le type exact attendu par votre SDK.
     */
    async createRoom(roomId) {
        try {
            console.log(`📡 Twilio → Tentative de création de la room: ${roomId}`);

            // STRATÉGIE A : Utilisation du type explicite 'peer-to-peer'
            // (Requis par votre message d'erreur précédent)
            const room = await this.client.video.v1.rooms.create({
                uniqueName: roomId,
                type: "peer-to-peer" 
            });

            console.log(`✅ Twilio → Room créée avec succès (SID: ${room.sid})`);
            return room;

        } catch (err) {
            // CAS 1 : La room existe déjà (Code 53113)
            // C'est un succès déguisé : on peut continuer.
            if (err.code === 53113) {
                console.log(`ℹ️ Twilio → La room "${roomId}" est déjà active.`);
                return { uniqueName: roomId };
            }

            // CAS 2 : Erreur de type (Votre erreur précédente)
            // On tente une STRATÉGIE B : Création sans spécifier le type (Twilio choisira le défaut)
            console.warn(`⚠️ Twilio → Erreur type spécifique (${err.message}). Tentative de repli...`);
            
            try {
                const fallbackRoom = await this.client.video.v1.rooms.create({
                    uniqueName: roomId
                });
                console.log(`✅ Twilio → Room créée via repli (Type par défaut).`);
                return fallbackRoom;
            } catch (secondErr) {
                // CAS 3 : Erreur fatale (Mauvaises clés API, compte suspendu, etc.)
                console.error("❌ Twilio → ÉCHEC FATAL de création de room:", secondErr.message);
                throw secondErr; 
            }
        }
    }

    /**
     * 2️⃣ SUPPRESSION DE ROOM
     */
    async deleteRoom(roomId) {
        try {
            console.log(`🗑️ Twilio → Clôture de la room: ${roomId}`);
            await this.client.video.v1.rooms(roomId).update({ status: "completed" });
            console.log(`✅ Twilio → Room "${roomId}" fermée.`);
            return true;
        } catch (err) {
            console.warn(`⚠️ Twilio → Impossible de fermer la room: ${err.message}`);
            return false;
        }
    }

    /**
     * 3️⃣ GÉNÉRATION DE TOKEN
     */
    generateToken(userId, role, roomId) {
        try {
            const identity = role === "prof" ? `prof_${userId}` : `student_${userId}`;

            const token = new this.AccessToken(
                process.env.TWILIO_ACCOUNT_SID,
                process.env.TWILIO_API_KEY,
                process.env.TWILIO_API_SECRET,
                { identity: identity, ttl: 14400 } // 4 heures
            );

            const videoGrant = new this.VideoGrant({ room: roomId });
            token.addGrant(videoGrant);

            console.log(`🎫 Twilio → Token généré pour: ${identity}`);
            return token.toJwt();
        } catch (err) {
            console.error("❌ Twilio → Erreur Token:", err.message);
            return null;
        }
    }
}

export const TwilioService = new TwilioServiceClass();