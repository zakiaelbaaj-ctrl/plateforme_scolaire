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

/**
 * @route   PATCH /api/v1/etudiant/preferences
 * @desc    Met à jour matiere / langue_matiere / niveau de l'étudiant connecté
 *          (appelé à chaque connexion, depuis le modal de préférences)
 */
router.patch("/preferences", auth, async (req, res) => {
  try {
    if (req.user.role !== "etudiant") {
      return res.status(403).json({ success: false, message: "Accès réservé aux étudiants." });
    }

    const userId = req.user.userId || req.user.id;
    const { matiere, langue_matiere, niveau } = req.body;

    if (!matiere || !langue_matiere || !niveau) {
      return res.status(400).json({
        success: false,
        message: "Les champs matiere, langue_matiere et niveau sont requis."
      });
    }

    // ✅ matiere / niveau sont des colonnes JSON en base : on stocke un tableau
    //    (1 seule valeur pour l'instant, mais ça reste extensible en multi-choix)
    await db.query(
      `UPDATE users
       SET matiere = :matiere, niveau = :niveau, langue_matiere = :langue_matiere
       WHERE id = :userId`,
      {
        replacements: {
          userId,
          matiere: JSON.stringify([matiere]),
          niveau: JSON.stringify([niveau]),
          langue_matiere
        },
        type: db.QueryTypes.UPDATE
      }
    );

    return res.json({
      success: true,
      message: "Préférences mises à jour.",
      data: { matiere, langue_matiere, niveau }
    });
  } catch (err) {
    console.error("❌ Erreur PATCH /preferences:", err.message);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});
export default router;
