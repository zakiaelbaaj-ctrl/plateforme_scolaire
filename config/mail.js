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
        port: 465,      // ✅ Port SSL plus stable sur Render
        secure: true,   // ✅ True pour le port 465
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS.replace(/\s+/g, '') // ✅ Supprime les espaces si tu as copié/collé le code Google
        },
        tls: {
            rejectUnauthorized: false
        },
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000
    });

    // ✅ Test de connexion immédiat au démarrage
    transporter.verify((error, success) => {
        if (error) {
            console.error("❌ Erreur SMTP (Détails) :", error);
            console.log("📊 Email service: ❌ DÉSACTIVÉ");
            logger.error("📊 Email service: ❌ DÉSACTIVÉ", error);
        } else {
            console.log("📊 Email service: ✅ ACTIF (Serveur prêt à envoyer)");
            logger.info("📧 Service email configuré et opérationnel");
        }
    });

} else {
    console.warn("⚠️ SMTP non configuré : EMAIL_USER ou EMAIL_PASS manquant.");
    logger.warn("⚠️ Service email désactivé (identifiants manquants)");
}

export default transporter;