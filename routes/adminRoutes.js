// routes/adminRoutes.js
import express from "express";
import { Pool } from "pg";
const router = express.Router();

// --- PostgreSQL pool ---
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  ssl: { rejectUnauthorized: false }
});

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
        COALESCE(SUM(a.duree_minutes)/60, 0) AS heures_en_ligne
      FROM professeurs p
      LEFT JOIN appels a 
        ON p.username = a.prof_username
        AND a.statut = 'termine'
        AND DATE_TRUNC('month', a.start_time) = DATE_TRUNC('month', CURRENT_DATE)
      GROUP BY p.id, p.prenom, p.nom, p.username, p.statut
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
    const result = await pool.query(
      "UPDATE professeurs SET statut=$1 WHERE id=$2 RETURNING *",
      [statut, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Professeur non trouvé" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error("❌ Erreur PUT professeur:", err.message);
    res.status(500).json({ error: "Impossible de mettre à jour le professeur" });
  }
});

// --- DELETE : supprimer un professeur ---
router.delete("/professeurs/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("DELETE FROM professeurs WHERE id=$1 RETURNING *", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Professeur non trouvé" });
    res.json({ message: "Professeur supprimé", prof: result.rows[0] });
  } catch (err) {
    console.error("❌ Erreur DELETE professeur:", err.message);
    res.status(500).json({ error: "Impossible de supprimer le professeur" });
  }
});

export default router;
