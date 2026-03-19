// ======================================================
// ROUTE TWILIO TOKEN — RÉSERVÉE AUX ÉTUDIANTS
// Chemin : routes/v1/twilio/twilio.student.routes.js
// ======================================================

import express from "express";
import Twilio from "twilio";
import auth from "../../../middlewares/auth.middleware.js";
import { MatchRegistry } from "../../../ws/match.registry.js";

const router = express.Router();

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
} = process.env;

// ======================================================
// POST /api/v1/twilio/student/token
// ======================================================
router.post("/student/token", auth, (req, res) => {
  try {
    const user = req.user; // injecté par auth.middleware
    const { room } = req.body;

    console.log("🎓 TWILIO STUDENT TOKEN — BODY:", req.body);

    // --------------------------------------------------
    // 1️⃣ Vérification du body
    // --------------------------------------------------
    if (!room) {
      return res.status(400).json({ message: "room requise" });
    }

    // --------------------------------------------------
    // 2️⃣ Sécurité : seuls les étudiants peuvent obtenir un token
    // --------------------------------------------------
    if (user.role !== "eleve") {
      return res.status(403).json({ message: "Accès réservé aux étudiants" });
    }

    // --------------------------------------------------
    // 3️⃣ Vérifier que l’étudiant appartient à la room
    // --------------------------------------------------
    const allowed = MatchRegistry.isUserInRoom(user.id, room);

    if (!allowed) {
      return res.status(403).json({
        message: "Vous n'êtes pas autorisé à rejoindre cette room"
      });
    }

    // --------------------------------------------------
    // 4️⃣ Génération du token Twilio
    // --------------------------------------------------
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      { identity: `student_${user.id}` }
    );

    token.addGrant(new VideoGrant({ room }));

    // --------------------------------------------------
    // 5️⃣ Retourner le token Twilio
    // --------------------------------------------------
    return res.json({ token: token.toJwt() });

  } catch (err) {
    console.error("❌ Erreur Twilio Student Token:", err);
    return res.status(500).json({ message: "Erreur génération token" });
  }
});

export default router;
