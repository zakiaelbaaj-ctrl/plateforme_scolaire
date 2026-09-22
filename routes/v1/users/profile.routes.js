import express from "express";
import { pool } from "../../../config/db.js";
import { requireAuth } from "../../../middlewares/requireAuth.js";
import { langueParCode } from "../../../public/js/shared/langues.js";

const router = express.Router();


// ======================================================
// GET PROFIL UTILISATEUR CONNECTÉ
// GET /api/v1/users/profile/me
// ======================================================
router.get("/me", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows } = await pool.query(
      `SELECT id, prenom, nom, email, role, ville, pays, matiere, niveau, sujet, classe, langue,
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
  const { ville, pays, matiere, niveau, sujet, classe, langue } = req.body;

  // Seule une langue connue est acceptee ; toute autre valeur est ignoree.
  const langueValide = langueParCode(langue) ? langue : null;

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
           sujet = COALESCE($5, sujet),
           classe = COALESCE($6, classe),
           langue = COALESCE($7, langue)
       WHERE id = $8`,
      [ville ?? null, pays ?? null, finalMatiere, finalNiveau, finalSujet, classe || null, langueValide, userId]
    );

    res.json({ success: true });

  } catch (err) {
    console.error("❌ update profile:", err.message);
    res.status(500).json({ message: "Erreur DB" });
  }
});
// ======================================================
// GET /api/v1/users/profile/versements
// Solde et detail des sommes dues au professeur connecte.
// ======================================================
router.get("/versements", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const { rows: lignes } = await pool.query(
      `SELECT v.id, v.visio_session_id, v.montant_cents, v.devise,
              v.statut, v.created_at, v.verse_le, v.reference,
              s.duration_seconds
         FROM versements_dus v
         LEFT JOIN visio_sessions s ON s.id = v.visio_session_id
        WHERE v.prof_id = $1
        ORDER BY v.created_at DESC
        LIMIT 200`,
      [userId]
    );

    const somme = (statut) =>
      lignes
        .filter((l) => l.statut === statut)
        .reduce((total, l) => total + l.montant_cents, 0);

    res.json({
      totalDu: somme("du"),
      totalVerse: somme("verse"),
      devise: "EUR",
      lignes,
    });
  } catch (err) {
    console.error("❌ versements:", err.message);
    res.status(500).json({ message: "Erreur DB" });
  }
});

export default router;
