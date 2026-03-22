// ============================================
// config/mail.js - Configuration Nodemailer
// ============================================

import dotenv from "dotenv";
import nodemailer from "nodemailer";
import logger from "./logger.js";
dotenv.config();

let transporter = null;
console.log("--- DIAGNOSTIC SMTP ---");
console.log("Utilisateur trouvé :", !!process.env.EMAIL_USER); // Affiche true ou false
console.log("Mot de passe trouvé :", !!process.env.EMAIL_PASS); // Affiche true ou false
console.log("-----------------------");
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    pool: true,
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    connectionTimeout: 10000,
    socketTimeout: 10000
  });

  logger.info("📧 Service email configuré");
} else {
  logger.warn("⚠️ Service email désactivé (identifiants manquants)");
}

export default transporter;
