// =======================================================
// SERVER COMPLET – Plateforme Scolaire
// PostgreSQL, WebSocket, Email, Stripe, API v1
// =======================================================

import "dotenv/config"; // Chargement des variables d'environnement
import http from "http";
import app from "./app.js";
import { initWebSocketServer } from "./socket.js";
import { pool } from "./config/db.js";
import { initDb } from "./config/index.js";
import { verifyMailer } from "./services/mail.service.js";

// =======================================================
// Initialisation DB
// =======================================================
await initDb({ syncModels: false })
// TEMPORAIRE — migration payments
try {
  await pool.query(`
    ALTER TABLE payments 
    ADD CONSTRAINT payments_stripe_session_id_unique UNIQUE (stripe_session_id)
  `);
  console.log("✅ Migration payments: contrainte UNIQUE ajoutée");
} catch (err) {
  console.log("ℹ️ Migration payments déjà faite:", err.message);
}

// =======================================================
// PostgreSQL Pool
// =======================================================
console.log("🔍 Variables d'environnement DB :");
console.log("DB_HOST:", process.env.DB_HOST);
console.log("DB_USER:", process.env.DB_USER);
console.log("DB_NAME:", process.env.DB_NAME);
console.log("DB_PORT:", process.env.DB_PORT);
console.log("DB_PASS:", process.env.DB_PASS ? "***" : "NON DÉFINI");

pool
  .connect()
  .then(() => console.log("✅ Connecté à PostgreSQL"))
  .catch((err) => console.error("❌ Erreur PostgreSQL :", err));
// =======================================================
// WebSocket Server
// =======================================================
const server = http.createServer(app);
initWebSocketServer(server);

// =======================================================
// Gestion des erreurs globales
// =======================================================
app.use((err, req, res, next) => {
  console.error("❌ Erreur interceptée:", err);
  const status = err.statusCode || 500;
  const message =
    process.env.NODE_ENV === "production"
      ? "Erreur serveur"
      : err.message || "Erreur interne";

  res.status(status).json({
    ok: false,
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// =======================================================
// Gestion erreurs process
// =======================================================
process.on("uncaughtException", (err) => {
  console.error("❌ Erreur non interceptée:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("❌ Promesse rejetée non gérée:", reason);
});

// =======================================================
// Shutdown propre
// =======================================================
function gracefulShutdown(signal) {
  console.log(`🔌 Signal reçu: ${signal}. Fermeture du serveur...`);
  server.close(() => {
    console.log("✅ Serveur HTTP fermé proprement");
    pool.end(() => {
      console.log("✅ Connexion DB fermée");
      process.exit(0);
    });
  });
}

["SIGINT", "SIGTERM"].forEach((signal) =>
  process.on(signal, () => gracefulShutdown(signal))
);
// =======================================================
// Start server
// =======================================================
const PORT = process.env.PORT || 4000;

server.listen(PORT, async () => {
  // ✅ Mailer vérifié une fois que le serveur est prêt
  await verifyMailer().catch(err =>
    console.warn("⚠️ Mailer en mode dégradé:", err.message)
  );
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
