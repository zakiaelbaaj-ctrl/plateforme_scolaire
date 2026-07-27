import express from "express";
import { pool } from "../../../config/db.js";

const router = express.Router();

// Protection : nécessite un secret partagé, jamais le même que vos autres clés
const MIGRATION_SECRET = process.env.MIGRATION_SECRET;

router.post("/run-migration-matiere-niveau", async (req, res) => {
  const providedSecret = req.headers["x-migration-secret"];

  if (!MIGRATION_SECRET || providedSecret !== MIGRATION_SECRET) {
    return res.status(403).json({ success: false, message: "Non autorisé" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // ===== Vérification structure actuelle =====
    const { rows: columns } = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name IN ('matiere', 'niveau')
    `);

    const matiereType = columns.find(c => c.column_name === "matiere")?.data_type;
    const niveauType = columns.find(c => c.column_name === "niveau")?.data_type;

    // Si déjà en JSON, on ne refait rien (idempotent)
    if (matiereType === "json") {
      await client.query("ROLLBACK");
      return res.json({ success: true, message: "matiere déjà en JSON, rien à faire", columns });
    }

    // ===== MATIERE =====
    await client.query(`ALTER TABLE users RENAME COLUMN matiere TO matiere_old`);
    await client.query(`ALTER TABLE users ADD COLUMN matiere JSON`);
    await client.query(`
      UPDATE users
      SET matiere = CASE
        WHEN matiere_old IS NULL OR TRIM(matiere_old) = '' THEN NULL
        ELSE json_build_array(matiere_old)
      END
    `);
    await client.query(`ALTER TABLE users DROP COLUMN matiere_old`);

    // ===== NIVEAU =====
    if (niveauType !== "json") {
      await client.query(`ALTER TABLE users RENAME COLUMN niveau TO niveau_old`);
      await client.query(`ALTER TABLE users ADD COLUMN niveau JSON`);
      await client.query(`
        UPDATE users
        SET niveau = CASE
          WHEN niveau_old IS NULL OR TRIM(niveau_old) = '' THEN NULL
          ELSE json_build_array(niveau_old)
        END
      `);
      await client.query(`ALTER TABLE users DROP COLUMN niveau_old`);
    }

    await client.query("COMMIT");

    const { rows: result } = await client.query(
      `SELECT id, prenom, nom, matiere, niveau FROM users WHERE role = 'prof'`
    );

    return res.json({ success: true, message: "Migration terminée", data: result });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Erreur migration:", err);
    return res.status(500).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});
router.get("/check-encoding", async (req, res) => {
  const providedSecret = req.headers["x-migration-secret"];

  if (!MIGRATION_SECRET || providedSecret !== MIGRATION_SECRET) {
    return res.status(403).json({ success: false, message: "Non autorisé" });
  }

  try {
    const { rows } = await pool.query(`
      SELECT id, prenom, nom, matiere::text, niveau::text
      FROM users
      WHERE matiere IS NOT NULL OR niveau IS NOT NULL
      ORDER BY id
    `);

    const corrupted = rows.filter(r =>
      (r.matiere && r.matiere.includes("�")) ||
      (r.niveau && r.niveau.includes("�"))
    );

    return res.json({
      success: true,
      total: rows.length,
      corrupted: corrupted.length,
      corruptedRows: corrupted,
      allRows: rows
    });
  } catch (err) {
    console.error("❌ Erreur check-encoding:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;