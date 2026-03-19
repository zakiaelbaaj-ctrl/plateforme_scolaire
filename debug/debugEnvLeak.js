// debug/debugEnvLeak.js
// ⚠️ Ce script montre volontairement comment les secrets peuvent fuiter.
// Il sert uniquement à des fins pédagogiques. Ne jamais l'utiliser en production.

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

logger.info("==============================================");
logger.info("⚠️  DEBUG ENV LEAK — EXEMPLE DE FUITES DE SECRETS");
logger.info("==============================================\n");

// 1) Fuite complète : affiche absolument toutes les variables d'environnement
logger.info("🔴 1) Fuite complète de process.env :");
logger.info(process.env); // ❌ DANGEREUX
logger.info("\n");

// 2) Fuite ciblée : secrets affichés en clair
logger.info("🔴 2) Fuite ciblée des secrets :");
logger.info({
  DB_PASS: process.env.DB_PASS,                     // ❌ fuite
  DATABASE_URL: process.env.DATABASE_URL,           // ❌ fuite
  JWT_SECRET: process.env.JWT_SECRET,               // ❌ fuite
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY, // ❌ fuite
  EMAIL_PASS: process.env.EMAIL_PASS,               // ❌ fuite
});
logger.info("\n");

// 3) Fuite via URL PostgreSQL
logger.info("🔴 3) Fuite via URL PostgreSQL :");
logger.info(`DATABASE_URL = ${process.env.DATABASE_URL}`); // ❌ fuite
logger.info("\n");

// 4) Fuite via un log innocent
logger.info("🔴 4) Fuite via un log innocent :");
logger.info(
  `Connexion à la base avec l'utilisateur ${process.env.DB_USER} et le mot de passe ${process.env.DB_PASS}` // ❌ fuite
);
logger.info("\n");

logger.info("==============================================");
logger.info("⚠️  FIN DU DEBUG — NE PAS UTILISER EN PRODUCTION");
logger.info("==============================================");
