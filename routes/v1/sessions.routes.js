// routes/v1/sessions.routes.js
import express from "express";
import { requireAuth, requireRole } from "../../../middlewares/auth.middleware.js";
import pool from "../../../config/db.js"; // instance PostgreSQL

const router = express.Router();

/**
 * POST /api/v1/sessions
 * Enregistre une session de visio
 * Body attendu :
 * {
 *   "prof_id": 3,
 *   "eleve_id": 12,
 *   "matiere": "Maths",
 *   "sujet": "Intégrales",
 *   "duree": 1800
 * }
 */
router.post("/", requireAuth, requireRole("professeur"), async (req, res) => {
  try {
    const { prof_id, eleve_id, matiere, sujet, duree } = req.body;

    // ✅ Validation simple
    if (!prof_id || !eleve_id || !matiere || !sujet || !duree) {
      return res.status(400).json({ success: false, message: "Champs manquants" });
    }

    const query = `
      INSERT INTO sessions (prof_id, eleve_id, matiere, sujet, duree, date_session)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id, prof_id, eleve_id, matiere, sujet, duree, date_session
    `;

    const values = [prof_id, eleve_id, matiere, sujet, duree];

    const result = await pool.query(query, values);

    return res.json({ success: true, session: result.rows[0] });

  } catch (err) {
    console.error("❌ Erreur POST /sessions", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});

export default router;
