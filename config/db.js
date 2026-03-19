// config/db.js
import pkg from "pg";
import { Sequelize } from "sequelize";
import 'dotenv/config';

const { Pool } = pkg;

// ---- PostgreSQL Pool (pour requêtes brutes) ----
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // obligatoire pour Render
  max: 5,                // max connexions simultanées
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 20000,
});
console.log("📌 Connected to DB:", new URL(process.env.DATABASE_URL).pathname.replace("/", ""));

// Test rapide de la connexion
pool.connect()
  .then(client => {
    console.log("✅ Connecté à PostgreSQL via pool");
    client.release();
  })
  .catch(err => {
    console.error("❌ Erreur PostgreSQL :", err.message);
  });

// ---- Sequelize (optionnel, si tu utilises ORM) ----
export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: "postgres",
  protocol: "postgres",
  logging: console.log,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  pool: {
    max: 5,
    min: 0,
    acquire: 60000,
    idle: 10000,
  },
});

// Fonction pour initialiser la DB (option sync)
export async function initDb({ syncModels = false } = {}) {
  try {
    await sequelize.authenticate();
    console.log("✅ Connexion PostgreSQL (Sequelize) OK");

    if (syncModels) {
      await sequelize.sync({ alter: true });
      console.log("✅ Modèles synchronisés avec la DB");
    }
  } catch (err) {
    console.error("❌ Connexion Sequelize échouée :", err.message);
    throw err;
  }
}
