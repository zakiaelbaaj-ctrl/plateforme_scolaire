// =======================================================
// SERVER COMPLET – Plateforme Scolaire
// PostgreSQL, WebSocket, Email, Stripe, API v1
// =======================================================

import "dotenv/config"; // Chargement des variables d'environnement
import http from "http";
import nodemailer from "nodemailer";
import app from "./app.js";
import { initWebSocketServer } from "./socket.js";
import { pool } from "./config/db.js";
import { initDb } from "./config/index.js";
console.log("--- VÉRIFICATION DOSSIER RACINE ---");
console.log("AC SID:", process.env.TWILIO_ACCOUNT_SID);
console.log("AUTH TOKEN:", process.env.TWILIO_AUTH_TOKEN ? "PRÉSENT" : "ABSENT ❌");
console.log("API KEY:", process.env.TWILIO_API_KEY);
console.log("API SECRET:", process.env.TWILIO_API_SECRET ? "PRÉSENT" : "ABSENT ❌");
// =======================================================
// Initialisation DB
// =======================================================
await initDb({ syncModels: false }); // ou true en dev

// =======================================================
// Email configuration – Nodemailer
// =======================================================
let transporter = null;
let emailEnabled = false;

function initializeEmailService() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.log("ℹ️ Service email désactivé (EMAIL_USER ou EMAIL_PASS non défini)");
    emailEnabled = false;
    return;
  }

  try {
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
      connectionTimeout: 5000,
      socketTimeout: 5000,
      logger: false,
      debug: false,
    });

    transporter.verify((err) => {
      if (err) {
        console.log("⚠️ Service email NON configuré:", err.message);
        emailEnabled = false;
      } else {
        emailEnabled = true;
        console.log("✅ Service email configuré et testé avec succès");

        transporter
          .sendMail({
            from: process.env.EMAIL_USER,
            to: "ton_email_de_test@gmail.com", // remplace par ton email
            subject: "Test Email – Plateforme Scolaire",
            text: "Bonjour, votre mailer fonctionne correctement !",
          })
          .then((info) => {
            console.log("✅ Email de test envoyé :", info.response);
          })
          .catch((err) => {
            console.error("❌ Erreur envoi email :", err.message);
          });
      }

      console.log(`📊 Email service: ${emailEnabled ? "✅ ACTIVÉ" : "❌ DÉSACTIVÉ"}`);
    });
  } catch (error) {
    transporter = null;
    emailEnabled = false;
    console.log("⚠️ Erreur config email:", error.message);
  }
}

initializeEmailService();

// favicon
app.get("/favicon.ico", (req, res) => res.status(204).send());


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
server.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
});
