import express from "express";
import { db } from "../../../config/index.js"; // Ajuste le nombre de ../ selon ta structure
import auth from "../../../middlewares/auth.middleware.js";

const router = express.Router();

/**
 * @route   GET /api/v1/etudiant/me
 * @desc    Récupère le profil de l'étudiant connecté
 */
router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    // ✅ Correction des noms de colonnes dans la requête SELECT
const [user] = await db.query(
  `SELECT id, email, prenom, nom, role, is_active, is_subscriber, ville, pays, matiere, tarif_horaire, balance, minutes_remaining, date_inscription 
   FROM users WHERE id = :userId`,
  {
    replacements: { userId },
    type: db.QueryTypes.SELECT
  }
);

   if (!user) {
      return res.status(404).json({ success: false, message: "Utilisateur non trouvé" });
    }

    return res.json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error("❌ Erreur Route /me:", err.message);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

export default router;
