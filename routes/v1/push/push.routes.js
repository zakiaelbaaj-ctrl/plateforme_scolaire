// routes/v1/push/push.routes.js
import express from "express";
import webpush from "web-push";
import { requireAuth } from "#middlewares/requireAuth.js";
import { subscribePush, unsubscribePush, getVapidPublicKey } from "#controllers/push.controller.js";
import { pool } from "#config/db.js";

const router = express.Router();

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contact@urgencescolaire.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscribe", requireAuth, subscribePush);
router.post("/unsubscribe", requireAuth, unsubscribePush);

// 1. Modifier la disponibilité
router.post("/disponibilite", requireAuth, async (req, res, next) => {
  try {
    const { estDisponible } = req.body;
    const userId = req.user.id;

    await pool.query(
      'UPDATE users SET est_disponible = $1 WHERE id = $2',
      [estDisponible, userId]
    );

    res.status(200).json({ ok: true, estDisponible });
  } catch (err) {
    next(err);
  }
});
// ✅ NOUVEAU : Lire la disponibilité actuelle (état initial du toggle)
router.get("/disponibilite", requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT est_disponible FROM users WHERE id = $1',
      [req.user.id]
    );
    res.status(200).json({ ok: true, estDisponible: result.rows[0]?.est_disponible || false });
  } catch (err) {
    next(err);
  }
});
export default router;