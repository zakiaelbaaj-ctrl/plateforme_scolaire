import express from "express";
import multer from "multer";
import { signupProfController } from "#controllers/signupProfController.js";
import { registerController } from "#controllers/registerController.js"; // Importe ton contrôleur d'inscription classique

const router = express.Router();
const upload = multer({ dest: 'uploads/diplomes/' });

// --- INSCRIPTION PROFESSEUR ---
// Route: POST /api/v1/auth/signup-prof
router.post("/signup-prof", upload.single("diplome"), signupProfController);

// --- INSCRIPTION ÉLÈVE ---
// Route: POST /api/v1/auth/signup-eleve
// Note: Pas besoin de multer ici car l'élève n'envoie pas de diplôme
router.post("/signup-eleve", registerController);
export default router;