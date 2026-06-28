import express from "express";
import { pool } from "../../config/db.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { profId, rating, comment, visioSessionId = null } = req.body;

    if (!profId || !rating) {
      return res.status(400).json({
        message: "profId et rating obligatoires"
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        message: "La note doit être entre 1 et 5"
      });
    }

    // ✅ Récupérer l'élève depuis le token JWT
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Non authentifié" });
    }

    const token = authHeader.split(" ")[1];
    const jwt = await import("jsonwebtoken");
    const payload = jwt.default.verify(token, process.env.JWT_SECRET);
    const eleveId = payload.userId;

    // ✅ Insertion dans notations_cours
    await pool.query(
      `INSERT INTO notations_cours 
        (visio_session_id, eleve_id, professeur_id, note, commentaire, statut)
       VALUES ($1, $2, $3, $4, $5, 'approved')`,
      [visioSessionId, eleveId, profId, rating, comment || null]
    );

    console.log("Nouvelle notation :", { profId, rating, comment });

    return res.status(201).json({
      success: true,
      message: "Notation enregistrée"
    });

  } catch (error) {
    console.error("Erreur rating:", error);
    res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
});
// GET /api/v1/ratings/prof/:profId
router.get("/prof/:profId", async (req, res) => {
    try {
        const { profId } = req.params;

        const { rows } = await pool.query(
            `SELECT 
                ROUND(AVG(note), 1) as note_moyenne,
                COUNT(*) as total_avis,
                COUNT(CASE WHEN note = 5 THEN 1 END) as cinq_etoiles,
                COUNT(CASE WHEN note = 4 THEN 1 END) as quatre_etoiles,
                COUNT(CASE WHEN note = 3 THEN 1 END) as trois_etoiles,
                COUNT(CASE WHEN note = 2 THEN 1 END) as deux_etoiles,
                COUNT(CASE WHEN note = 1 THEN 1 END) as une_etoile
             FROM notations_cours 
             WHERE professeur_id = $1 
             AND statut = 'approved'`,
            [profId]
        );

        const { rows: avis } = await pool.query(
            `SELECT 
                n.note,
                n.commentaire,
                n.created_at,
                u.prenom,
                u.nom
             FROM notations_cours n
             JOIN users u ON u.id = n.eleve_id
             WHERE n.professeur_id = $1
             AND n.statut = 'approved'
             ORDER BY n.created_at DESC
             LIMIT 10`,
            [profId]
        );

        res.json({
            stats: rows[0],
            avis
        });

    } catch (err) {
        console.error("Erreur récupération notations:", err);
        res.status(500).json({ message: "Erreur serveur" });
    }
});
export default router;