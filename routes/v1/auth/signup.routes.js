import express from "express";
import multer from "multer";
import path from "path";
import { signupProfController } from "#controllers/signupProfController.js";
import { registerController } from "#controllers/registerController.js"; // Importe ton contrôleur d'inscription classique

const router = express.Router();

// ✅ Storage personnalisé : conserve l'extension d'origine du fichier
// (.pdf, .jpg, .png...) au lieu du nom aléatoire sans extension généré par défaut
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/diplomes/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// --- INSCRIPTION PROFESSEUR ---
// Route: POST /api/v1/auth/signup-prof
router.post(
  "/signup-prof",
  upload.fields([
    { name: "diplome", maxCount: 1 },
    { name: "piece_identite", maxCount: 1 },
    { name: "photo_identite", maxCount: 1 },
  ]),
  signupProfController
);

// --- INSCRIPTION ÉLÈVE ---
// Route: POST /api/v1/auth/signup-eleve
// Note: Pas besoin de multer ici car l'élève n'envoie pas de diplôme
router.post("/signup-eleve", registerController);
export default router;