import express from "express";
import { db } from "../../config/index.js";
import { requireAuth } from "#middlewares/auth.middleware.js";

const router = express.Router();

router.get("/config", requireAuth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    const [user] = await db.query(
      `SELECT role, is_subscriber, subscription_status FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: db.QueryTypes.SELECT
      }
    );

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    const isAuthorized = user.is_subscriber === true || user.subscription_status === 'active';

    if (user.role === "etudiant" && !isAuthorized) {
      console.log(`🔒 WebRTC désactivé pour l'étudiant (ID: ${userId}) : Pas de carte.`);
      return res.json({ iceServers: [] });
    }

    const isProf = user.role === "prof";
    const isPremium = isProf || user.is_subscriber;

    const freeConfig = [{ urls: "stun:stun.l.google.com:19302" }];
    const premiumConfig = [{
        urls: "turn:your-turn-server.com:3478",
        username: "user",
        credential: "pass"
    }];

    return res.json({
      iceServers: isPremium ? premiumConfig : freeConfig
    });

  } catch (err) {
    console.error("❌ Erreur critique WebRTC Config:", err.message);
    return res.status(200).json({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }
});

export default router;