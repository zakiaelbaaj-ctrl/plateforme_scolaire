// --------------------------------------------------
// Configuration Sequelize – senior+++, DEV / PROD
// --------------------------------------------------

import logger from "#config/logger.js";
import { Sequelize } from "sequelize";

const isProd = process.env.NODE_ENV === "production";

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    dialect: "postgres",

    logging: false, // mets console.log si besoin en debug

    // ✅ SSL uniquement en production
    dialectOptions: isProd
      ? {
          ssl: {
            require: true,
            rejectUnauthorized: false, // Render / Railway / Supabase
          },
        }
      : {},

    pool: {
      max: 20,
      min: 0,
      acquire: 30_000,
      idle: 10_000,
    },
  }
);

/**
 * Initialise la connexion DB
 * @param {Object} options
 * @param {boolean} options.syncModels - Synchronise les modèles (⚠️ DEV uniquement)
 */
export async function initDb({ syncModels = false } = {}) {
  try {
    await sequelize.authenticate();
    logger.info(
      `✅ DB connectée (${isProd ? "PRODUCTION" : "DÉVELOPPEMENT"})`
    );

    if (syncModels) {
      if (isProd) {
        logger.warn("⚠️ syncModels ignoré en PRODUCTION");
      } else {
        await sequelize.sync({ alter: true });
        logger.info("✅ Modèles synchronisés (DEV)");
      }
    }
  } catch (err) {
    logger.error("❌ Erreur connexion DB", {
      name: err?.name,
      message: err?.message,
    });
    throw err;
  }
}
