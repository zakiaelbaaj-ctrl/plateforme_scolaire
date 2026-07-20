// routes/v1/push/push.routes.js
import express from "express";
import { requireAuth } from "#middlewares/requireAuth.js";
import { subscribePush, unsubscribePush, getVapidPublicKey } from "#controllers/push.controller.js";
import { sequelize } from "#models/index.js";   // ← AJOUT IMPORTANT

const router = express.Router();

// Publique, pas besoin d'auth — c'est juste une clé publique
router.get("/vapid-public-key", getVapidPublicKey);

router.post("/subscribe", requireAuth, subscribePush);
router.post("/unsubscribe", requireAuth, unsubscribePush);

// ======================================================
// ROUTE ADMIN — CRÉATION COLONNE push_subscription SUR RENDER
// ======================================================
router.post("/fix-push-column", async (req, res) => {
  try {
    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS push_subscription JSON;
    `);

    return res.json({
      success: true,
      message: "Colonne push_subscription créée ou déjà existante."
    });
  } catch (err) {
    console.error("Erreur ALTER TABLE:", err);
    return res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

export default router;
