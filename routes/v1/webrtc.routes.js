import express from "express";
import { db } from "../../config/index.js";
import auth from "../../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/config", auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    // ✅ Correction : on récupère directement le premier utilisateur
    const [user] = await db.query(
      `SELECT role, is_subscriber FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: db.QueryTypes.SELECT
      }
    );

    if (!user) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    const isProf = user.role === "prof";
    const isPremium = isProf || user.is_subscriber;

    const freeConfig = [
      { urls: "stun:stun.l.google.com:19302" }
    ];

    const premiumConfig = [
      {
        urls: "turn:your-turn-server.com:3478",
        username: "user",
        credential: "pass"
      }
    ];

    return res.json({
      iceServers: isPremium ? premiumConfig : freeConfig
    });

  } catch (err) {
    console.error("❌ Erreur WebRTC Config:", err.message);

    // ✅ Fallback : toujours renvoyer au moins un STUN
    return res.status(200).json({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" }
      ]
    });
  }
});

export default router;
