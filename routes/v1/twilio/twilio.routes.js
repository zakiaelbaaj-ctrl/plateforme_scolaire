import express from "express";
import Twilio from "twilio";
import auth from "../../../middlewares/auth.middleware.js";

const router = express.Router();

console.log("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("TWILIO_API_KEY:", process.env.TWILIO_API_KEY);
console.log("TWILIO_API_SECRET:", process.env.TWILIO_API_SECRET ? "OK" : "undefined");

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY,
  TWILIO_API_SECRET,
} = process.env;

// ======================================================
// POST /prof/token — Token vidéo pour professeur
// ======================================================
router.post("/prof/token", auth, (req, res) => {
  const { room } = req.body;
  const userId = req.user?.userId;

  console.log("📞 Token prof demandé — room:", room, "userId:", userId);

  if (!room) {
    return res.status(400).json({ error: "room requis" });
  }

  if (!userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  try {
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      { identity: `prof_${userId}` }
    );

    token.addGrant(new VideoGrant({ room }));

    console.log("✅ Token Twilio généré pour prof", userId);
    res.json({ token: token.toJwt() });

  } catch (err) {
    console.error("❌ Erreur token prof:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ======================================================
// POST /student/token — Token vidéo pour élève
// ======================================================
router.post("/student/token", auth, (req, res) => {
  const { room } = req.body;
  const userId = req.user?.userId;

  console.log("📞 Token élève demandé — room:", room, "userId:", userId);

  if (!room) {
    return res.status(400).json({ error: "room requis" });
  }

  if (!userId) {
    return res.status(401).json({ error: "Non authentifié" });
  }

  try {
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      { identity: `student_${userId}` }
    );

    token.addGrant(new VideoGrant({ room }));

    console.log("✅ Token Twilio généré pour élève", userId);
    res.json({ token: token.toJwt() });

  } catch (err) {
    console.error("❌ Erreur token élève:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ======================================================
// POST /token — Route générique (compatibilité)
// ======================================================
router.post("/token", auth, (req, res) => {
  const body = req.body || {};
  console.log("BODY REÇU TWILIO:", body);

  const { room, userId } = body;

  if (!room || !userId) {
    return res.status(400).json({ message: "room et userId requis" });
  }

  try {
    const AccessToken = Twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    const token = new AccessToken(
      TWILIO_ACCOUNT_SID,
      TWILIO_API_KEY,
      TWILIO_API_SECRET,
      { identity: `user_${userId}` }
    );

    token.addGrant(new VideoGrant({ room }));

    res.json({ token: token.toJwt() });
  } catch (err) {
    console.error("❌ Erreur Twilio Token:", err);
    res.status(500).json({ message: "Erreur génération token" });
  }
});

export default router;