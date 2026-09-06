import express from "express";
import { activateAccountController, resendActivationController } from "#controllers/activationController.js";

const router = express.Router();

// --- ACTIVATION DE COMPTE (élève/étudiant) ---
// Route: GET /api/v1/auth/activate?token=xxx
router.get("/activate", activateAccountController);

// --- RENVOI D'UN LIEN D'ACTIVATION ---
// Route: POST /api/v1/auth/resend-activation
router.post("/resend-activation", resendActivationController);

export default router;