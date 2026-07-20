// routes/v1/push/push.routes.js
import express from "express";
import { requireAuth } from "#middlewares/requireAuth.js";
import { subscribePush, unsubscribePush, getVapidPublicKey } from "#controllers/push.controller.js";

const router = express.Router();

// Publique, pas besoin d'auth — c'est juste une clé publique
router.get("/vapid-public-key", getVapidPublicKey);

router.post("/subscribe", requireAuth, subscribePush);
router.post("/unsubscribe", requireAuth, unsubscribePush);


export default router;
