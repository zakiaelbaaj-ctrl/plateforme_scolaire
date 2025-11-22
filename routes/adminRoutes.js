// routes/adminRoutes.js
import express from "express";
import { pool } from "../server.js";

const router = express.Router();

// --- GET : tous les professeurs avec heures en ligne du mois ---
router.get("/professeurs/avec_heures", async (req, res) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.prenom,
        p.nom,
        p.username,
        p.statut,
        p.matiere,
        COALESCE(SUM(a.duree_minutes)/60, 0) AS heures_en_ligne
      FROM profs p
      LEFT JOIN appels a 
        ON p.username = a.prof_username
        AND a.statut = 'termine'
        AND DATE_TRUNC('month', a.start_time) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY p.id, p.prenom, p.nom, p.username, p.statut, p.matiere
      ORDER BY p.nom, p.prenom;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur GET professeurs:", err.message);
    res.status(500).json({ error: "Impossible de récupérer les professeurs" });
  }
});

// --- PUT : modifier statut d'un professeur ---
router.put("/professeurs/:id", async (req, res) => {
  const { id } = req.params;
  const { statut } = req.body;
  if (!statut) return res.status(400).json({ error: "Statut requis" });

  try {
    // Mettre à jour le statut dans profs
    const result = await pool.query(
      "UPDATE profs SET statut=$1 WHERE id=$2 RETURNING *",
      [statut, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Professeur non trouvé" });

    // Récupérer l'email du professeur
    const profResult = await pool.query("SELECT email FROM profs WHERE id = $1", [id]);
    if (profResult.rows.length > 0) {
      const email = profResult.rows[0].email;
      // Normaliser le statut
      const newStatut = statut === "validé" || statut === "valide" ? "valide" : statut;
      // Mettre à jour le statut dans users
      await pool.query("UPDATE users SET statut = $1 WHERE email = $2", [newStatut, email]);
    }

    res.json({ message: "Statut mis à jour avec succès", prof: result.rows[0] });
  } catch (err) {
    console.error("❌ Erreur PUT professeur:", err.message);
    res.status(500).json({ error: "Impossible de mettre à jour le professeur" });
  }
});

// --- DELETE : supprimer un professeur ---
router.delete("/professeurs/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Récupérer l'email avant suppression
    const profResult = await pool.query("SELECT email FROM profs WHERE id = $1", [id]);
    if (profResult.rowCount === 0) return res.status(404).json({ error: "Professeur non trouvé" });

    const email = profResult.rows[0].email;

    // Supprimer de profs
    await pool.query("DELETE FROM profs WHERE id = $1", [id]);

    // Supprimer de users
    await pool.query("DELETE FROM users WHERE email = $1", [email]);

    res.json({ message: "Professeur supprimé avec succès", prof: profResult.rows[0] });
  } catch (err) {
    console.error("❌ Erreur DELETE professeur:", err.message);
    res.status(500).json({ error: "Impossible de supprimer le professeur" });
  }
});

export default router;