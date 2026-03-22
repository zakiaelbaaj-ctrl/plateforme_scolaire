// ============================================
// config/mail.js - Configuration Nodemailer
// ============================================

import dotenv from "dotenv";
import nodemailer from "nodemailer";
import logger from "./logger.js";
dotenv.config();

let transporter = null;

console.log("--- DIAGNOSTIC SMTP ---");
console.log("Utilisateur trouvé :", !!process.env.EMAIL_USER); 
console.log("Mot de passe trouvé :", !!process.env.EMAIL_PASS); 
console.log("-----------------------");

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // false car on utilise STARTTLS sur le port 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false // Indispensable pour éviter les blocages de certificats sur Render
    },
    connectionTimeout: 60000,
    greetingTimeout: 60000,
    socketTimeout: 60000
  }); // La parenthèse doit se fermer ICI après toutes les options

  logger.info("📧 Service email configuré");
} else {
  logger.warn("⚠️ Service email désactivé (identifiants manquants)");
}

export default transporter;