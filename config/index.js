// --------------------------------------------------
// Configuration Sequelize – senior+++, robuste et maintenable
// --------------------------------------------------

import logger from "#config/logger.js";
import { Sequelize } from "sequelize";

export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  pool: {
    max: 20,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});
// 🔥 Ajout essentiel : export db
export const db = sequelize;

/**
 * Initialise la connexion DB et synchronise les modèles si demandé
 */
export async function initDb({ syncModels = false } = {}) {
  try {
    await sequelize.authenticate();
    logger.info("✅ Connexion à la base de données réussie");

    if (syncModels) {
      await sequelize.sync({ alter: true });
      logger.info("✅ Modèles synchronisés");
    }
  } catch (err) {
    logger.error("❌ Impossible de connecter à la base", {
      name: err?.name,
      message: err?.message,
    });
    throw err;
  }
}
