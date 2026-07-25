import express from "express";
import { pool } from "../../../config/db.js";

const router = express.Router();

// ⚠️ ROUTE TEMPORAIRE — À SUPPRIMER IMMÉDIATEMENT APRÈS USAGE
router.post("/fix-niveau-nullable", async (req, res) => {
  const { secret } = req.body;

  if (secret !== process.env.MIGRATION_SECRET) {
    return res.status(403).json({ success: false, message: "Non autorisé" });
  }

  try {
    await pool.query(`ALTER TABLE users ALTER COLUMN niveau DROP NOT NULL;`);

    const result = await pool.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name IN ('niveau', 'matiere');
    `);

    return res.json({ success: true, columns: result.rows });
  } catch (err) {
    console.error("❌ Erreur migration:", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;