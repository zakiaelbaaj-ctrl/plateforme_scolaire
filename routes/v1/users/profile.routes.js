import express from "express";
import { pool } from "../../../config/db.js";
import { requireAuth } from "../../../middlewares/requireAuth.js";

const router = express.Router();


// ======================================================
// GET PROFIL UTILISATEUR CONNECTÉ
// GET /api/v1/users/profile/me
// ======================================================
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `SELECT id, prenom, nom, email, role, ville, pays, matiere, sujet, 
              stripe_customer_id, has_payment_method -- ✅ AJOUTE CES DEUX COLONNES
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error("❌ get profile:", err.message);
    res.status(500).json({ message: "Erreur récupération profil" });
  }
});

// ======================================================
// UPDATE PROFIL
// PUT /api/v1/users/profile
// ======================================================
router.put("/", requireAuth, async (req, res) => {

  const userId = req.user.id;

  const { ville, pays, matiere, sujet } = req.body;

  try {

    const { rows } = await pool.query(
      `SELECT role FROM users WHERE id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

    const role = rows[0].role;

    const finalSujet = role === "eleve" ? sujet : null;

    await pool.query(
      `UPDATE users
       SET ville = $1,
           pays = $2,
           matiere = $3,
           sujet = $4
       WHERE id = $5`,
      [ville, pays, matiere, finalSujet, userId]
    );

    res.json({
      success: true
    });

  } catch (err) {

    console.error("❌ update profile:", err.message);

    res.status(500).json({
      message: "Erreur DB"
    });

  }

});

export default router;