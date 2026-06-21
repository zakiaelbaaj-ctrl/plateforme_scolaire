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
        service: 'gmail', 
        host: "smtp.gmail.com",
        port: 465,      
        secure: true,   
        pool: true,
        maxConnections: 5,
        maxMessages: 100,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS.replace(/\s+/g, '') 
        },
        tls: {
            rejectUnauthorized: false,
            servername: 'smtp.gmail.com' 
        },
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000
    });
    transporter.defaultOptions = {
        from: `"Atlasia Plateforme" <${process.env.EMAIL_USER}>`
    };
    const verifyConnection = () => {
        transporter.verify((error, success) => {
            if (error) {
                console.error("❌ Erreur SMTP (Détails) :", error.message);
                logger.error("❌ Email service: ❌ DÉSACTIVÉ", error);
            } else {
                console.log("📧Email service: ✅ ACTIF (Serveur prêt à envoyer)");
                logger.info("🔧 Service email configuré et opérationnel");
            }
        });
    };

    verifyConnection();

} else {
    transporter = {
        sendMail: async (mailOptions) => {
            logger.warn("⚠️ Tentative d'envoi d'email avortée : Service non configuré.");
            console.log("Contenu du mail qui aurait dû être envoyé :", mailOptions.subject);
            return { messageId: "fake-id", response: "Service disabled" };
        },
        verify: (cb) => cb(new Error("Service non configuré"), null)
    };

    console.warn("⚠️ SMTP non configuré : EMAIL_USER ou EMAIL_PASS manquant.");
    logger.warn("⚠️ Service email désactivé (identifiants manquants)");
}

export default transporter;
