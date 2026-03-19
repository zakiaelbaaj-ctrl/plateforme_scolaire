// debug/debugEnvSafe.js
// ✔️ Version sécurisée : aucune fuite de secrets
// ✔️ Peut être utilisée en développement sans risque
// ✔️ Masque automatiquement les valeurs sensibles

import dotenv from "dotenv";
dotenv.config({ path: ".env" });

// Liste des clés sensibles à masquer
const sensitiveKeys = [
  "DB_PASS",
  "DB_PASSWORD",
  "DATABASE_URL",
  "JWT_SECRET",
  "STRIPE_SECRET_KEY",
  "EMAIL_PASS",
  "SECRET_KEY"
];

// Fonction de masquage
function maskSecrets(obj) {
  if (!obj || typeof obj !== "object") return obj;

  const clone = {};
  for (const [key, value] of Object.entries(obj)) {
    if (sensitiveKeys.includes(key)) {
      clone[key] = "***"; // Masquage
    } else {
      clone[key] = value;
    }
  }
  return clone;
}

// Sélection des variables safe
const safeEnv = maskSecrets({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DATABASE_URL: process.env.DATABASE_URL, // sera masqué automatiquement
  JWT_SECRET: process.env.JWT_SECRET,     // sera masqué automatiquement
});

// Affichage propre
logger.info("==============================================");
logger.info("🔐 DEBUG ENV SAFE — VARIABLES SÉCURISÉES");
logger.info("==============================================\n");

logger.info("Variables d'environnement (safe) :");
logger.info(safeEnv);

logger.info("\n==============================================");
logger.info("✔️  FIN — Aucune donnée sensible n'a été affichée");
logger.info("==============================================");
