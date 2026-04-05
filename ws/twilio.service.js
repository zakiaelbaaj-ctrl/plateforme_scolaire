// ======================================================
// TWILIO SERVICE — CRÉATION DE ROOMS VIDÉO
// ======================================================
//
// Ce module encapsule toute la logique Twilio côté serveur.
// Il ne génère PAS de token ici (c’est fait dans l’API REST).
// Il ne gère PAS les WebSockets.
// Il fournit uniquement :
//   - createRoom(roomId)
//   - deleteRoom(roomId) (optionnel)
//
// ======================================================

import Twilio from "twilio";

class TwilioServiceClass {

  constructor() {
    // Initialisation du client Twilio
    this.client = Twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
  
);
  }

  // --------------------------------------------------
  // 1️⃣ Créer une room Twilio
  // --------------------------------------------------
  async createRoom(roomId) {
    try {
      console.log(`📡 Twilio → création room: ${roomId}`);

      await this.client.video.v1.rooms.create({
        uniqueName: roomId,
        type: "peer-to-peer" // Plus compatible avec les comptes Trial
      });

      console.log(`✅ Twilio room créée: ${roomId}`);

    } catch (err) {
      if (err.code === 53113) {
        // Room already exists → OK
        console.log(`ℹ️ Twilio: room ${roomId} existe déjà`);
        return;
      }

      console.error("❌ Erreur création room Twilio:", err);
    }
  }

  // --------------------------------------------------
  // 2️⃣ Supprimer une room (optionnel)
  // --------------------------------------------------
  async deleteRoom(roomId) {
    try {
      console.log(`🗑️ Twilio → suppression room: ${roomId}`);

      await this.client.video.v1.rooms(roomId).update({
        status: "completed"
      });

      console.log(`✅ Twilio room supprimée: ${roomId}`);

    } catch (err) {
      console.error("❌ Erreur suppression room Twilio:", err);
    }
  }
  // --------------------------------------------------
// 3️⃣ Générer un token d'accès pour un participant
// --------------------------------------------------
generateToken(userId, role, roomId) {
  const AccessToken = Twilio.jwt.AccessToken;
  const VideoGrant  = AccessToken.VideoGrant;

  // ✅ Même logique que twilio.routes.js
  const identity = role === "prof"
    ? `prof_${userId}`
    : `student_${userId}`;

  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity }
  );

  token.addGrant(new VideoGrant({ room: roomId }));

  console.log(`🎫 Token généré: ${identity} → room: ${roomId}`);
  return token.toJwt();
}
 }
 export const TwilioService = new TwilioServiceClass();