import express from "express";
import { db } from "../../config/index.js";
import auth from "../../middlewares/auth.middleware.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

router.get("/config", auth, async (req, res) => {
  try {
    // Correction : req.user contient souvent userId ou id selon ton middleware auth
    const userId = req.user.userId || req.user.id;

    // 1. Récupérer le statut d'abonnement
    // Utilisation de db.QueryTypes.SELECT si db est l'instance Sequelize
    const userRecords = await db.query(
      `SELECT role, is_subscriber FROM users WHERE id = :userId`,
      { 
        replacements: { userId }, 
        type: db.QueryTypes ? db.QueryTypes.SELECT : "SELECT" // Sécurité selon ta config
      }
    );

    const user = userRecords[0];
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });

    const freeConfig = [{ urls: "stun:stun.l.google.com:19302" }];

    // 2. Logique d'accès
    const isProf = user.role === "professeur" || user.role === "prof";
    
    if (isProf || user.is_subscriber === true) {
      // ✅ Si tes serveurs Twilio sont configurés dans le Dashboard Stripe
      const twilioToken = await stripe.tokens.create(); 
      return res.json({ iceServers: twilioToken.iceServers });
    }

    // 3. Mohamed reçoit le gratuit
    return res.json({ iceServers: freeConfig });

  } catch (err) {
    console.error("❌ Erreur WebRTC Config:", err.message);
    // En cas d'erreur, on renvoie au moins le STUN gratuit pour ne pas bloquer l'appel
    res.status(200).json({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  }
});

export default router;