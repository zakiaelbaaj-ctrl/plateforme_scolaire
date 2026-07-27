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
      `SELECT id, prenom, nom, email, role, ville, pays, matiere, niveau, sujet, 
              stripe_customer_id, has_payment_method, photo_identite_url
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
  const { ville, pays, matiere, niveau, sujet } = req.body;

  try {
    const { rows } = await pool.query(
      `SELECT role FROM users WHERE id = $1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Utilisateur introuvable" });
    }

     const role = rows[0].role;
     const finalSujet = role === "eleve" ? (sujet ?? null) : null;
     const finalNiveau = niveau
      ? JSON.stringify(Array.isArray(niveau) ? niveau : [niveau])
      : null;
      // ✅ AJOUT — même traitement pour matiere (SQL brut = besoin de JSON.stringify)
    const finalMatiere = matiere
      ? JSON.stringify(Array.isArray(matiere) ? matiere : [matiere])
      : null;

    // ✅ Toutes les valeurs non fournies passent explicitement à null (pas undefined)
    await pool.query(
      `UPDATE users
       SET ville = COALESCE($1, ville),
           pays = COALESCE($2, pays),
           matiere = COALESCE($3, matiere),
           niveau = COALESCE($4, niveau),
           sujet = COALESCE($5, sujet)
       WHERE id = $6`,
      [ville ?? null, pays ?? null, finalMatiere, finalNiveau, finalSujet, userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ update profile:", err.message);
    res.status(500).json({ message: "Erreur DB" });
  }
});
export default router;
