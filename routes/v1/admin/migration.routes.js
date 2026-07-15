// routes/v1/admin/migration.routes.js
import express from "express";
import { sequelize } from "#config/index.js";
import logger from "#config/logger.js";

const router = express.Router();

// ⚠️ Route temporaire — à supprimer après exécution une seule fois
router.post("/migrate-cv-lettre", async (req, res) => {
  // 🔒 Protection basique par clé secrète (à définir dans les variables d'env Render)
  const secret = req.headers["x-migration-secret"];
  if (secret !== process.env.MIGRATION_SECRET) {
    return res.status(403).json({ success: false, message: "Non autorisé" });
  }

  try {
    await sequelize.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS curriculum_vitae_url TEXT,
        ADD COLUMN IF NOT EXISTS lettre_motivation_url TEXT;
    `);

    logger.info("✅ Migration CV/Lettre de motivation exécutée avec succès");

    return res.status(200).json({
      success: true,
      message: "Colonnes curriculum_vitae_url et lettre_motivation_url ajoutées avec succès."
    });
  } catch (err) {
    logger.error("❌ Erreur migration CV/Lettre", { message: err.message });
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;