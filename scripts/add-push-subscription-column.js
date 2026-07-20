// scripts/add-push-subscription-column.js
//
// Usage :
//   node scripts/add-push-subscription-column.js
//
// À exécuter UNE SEULE FOIS, manuellement, en local ET sur Render
// (via le Shell de Render : Dashboard → ton service → Shell).
// Ce n'est PAS une route HTTP — jamais exposé publiquement.

import { sequelize } from "../config/db.js";

async function run() {
  try {
    await sequelize.authenticate();
    console.log("✅ Connecté à la base de données");

    await sequelize.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS push_subscription JSON;
    `);

    console.log("✅ Colonne push_subscription créée ou déjà existante.");
    process.exit(0);

  } catch (err) {
    console.error("❌ Erreur:", err.message);
    process.exit(1);
  }
}

run();