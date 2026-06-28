// --------------------------------------------------
// Configuration Sequelize – senior+++, robuste et maintenable
// --------------------------------------------------

import logger from "#config/logger.js";
import { Sequelize } from "sequelize";

// ✅ 1. Détecter l'environnement
const isProduction = process.env.NODE_ENV === 'production';

const databaseUrl = process.env.DATABASE_URL || 
  `postgresql://${process.env.DB_USER}:${process.env.DB_PASS}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`;

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: false,
  // ✅ 2. SSL dynamique : Activé sur Render (Prod), Désactivé sur ton PC (Local)
  dialectOptions: {
    ssl: isProduction ? {
      require: true,
      rejectUnauthorized: false,
    } : false,
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
      // ⚠️ Attention : alter: true est puissant, ton backup de tout à l'heure te protège ici
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
