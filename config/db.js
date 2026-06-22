import pkg from "pg";
import { Sequelize } from "sequelize";
import 'dotenv/config';

const { Pool } = pkg;

// --- Vérification ---
if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL non défini");
}

// ✅ Détection de l'environnement
const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL.includes('render.com');
// ✅ Config SSL : actif seulement en production
const sslConfig = isProduction ? { rejectUnauthorized: false } : false;
// ---- PostgreSQL Pool (pour requêtes brutes) ----
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
 
  ssl: sslConfig,  // ← false en local, actif sur Render
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
});

// ---- LOG SAFE ----
try {
  console.log("📌 Database target:", new URL(process.env.DATABASE_URL).hostname);
} catch (e) {
  console.log("📌 Database loaded");
}
// Test rapide de la connexion
pool.connect()
  .then(client => {
    console.log("✅ Pool PG prêt (Local ou Distant)");
    client.release();
  })
  .catch(err => {
    console.error("❌ Erreur Pool PG :", err.message);
  });

// ---- Sequelize ----
export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  logging: false, // Mis à false pour éviter de polluer ta console
  // ✅ SSL Dynamique pour Sequelize
  dialectOptions: {
    ssl: isProduction ? { require: true, rejectUnauthorized: false } : false  // ← même logique
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000,
  },
});

// Fonction pour initialiser la DB
export async function initDb({ syncModels = false } = {}) {
  try {
    await sequelize.authenticate();
    console.log("✅ Sequelize connecté");

    if (syncModels) {
      await sequelize.sync({ alter: true });
      console.log("✅ Modèles synchronisés");
    }
  } catch (err) {
    console.error("❌ Échec Sequelize :", err.message);
    throw err;
  }
}
