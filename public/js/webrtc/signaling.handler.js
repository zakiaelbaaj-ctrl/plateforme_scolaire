// ============================================
// config/mail.js - Configuration Nodemailer
// ============================================

import dotenv from "dotenv";
import nodemailer from "nodemailer";
import logger from "./logger.js";
dotenv.config();

let transporter = null;

console.log("--- DIAGNOSTIC SMTP ---");
console.log("Utilisateur trouvÃÂ© :", !!process.env.EMAIL_USER); 
console.log("Mot de passe trouvÃÂ© :", !!process.env.EMAIL_PASS); 
console.log("-----------------------");

if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail', 
        host: "smtp.gmail.com",
        port: 465,      
        secure: true,   
        // Ã¢ÂÂ AJOUT DU POOLING : Maintient la connexion ouverte pour envoyer plusieurs mails rapidement
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
        // Ã¢ÂÂ TIMEOUTS RENFORCÃÂS : Crucial pour ÃÂ©viter les "ENETUNREACH" sur Render
        connectionTimeout: 60000,
        greetingTimeout: 60000,
        socketTimeout: 60000
    });

    // Ã¢ÂÂ EXPÃÂDITEUR PAR DÃÂFAUT
    transporter.defaultOptions = {
        from: `"Atlasia Plateforme" <${process.env.EMAIL_USER}>`
    };

    // Ã¢ÂÂ TEST DE CONNEXION AVEC RETRY (Tentative de reconnexion)
    const verifyConnection = () => {
        transporter.verify((error, success) => {
            if (error) {
                console.error("Ã¢ÂÂ Erreur SMTP (DÃÂ©tails) :", error.message);
                logger.error("Ã°ÂÂÂ Email service: Ã¢ÂÂ DÃÂSACTIVÃÂ", error);
            } else {
                console.log("Ã°ÂÂÂ Email service: Ã¢ÂÂ ACTIF (Serveur prÃÂªt ÃÂ  envoyer)");
                logger.info("Ã°ÂÂÂ§ Service email configurÃÂ© et opÃÂ©rationnel");
            }
        });
    };

    verifyConnection();

} else {
    // Ã¢ÂÂ FALLBACK SECURISE : EmpÃÂªche le crash si les variables .env sont manquantes
    transporter = {
        sendMail: async (mailOptions) => {
            logger.warn("Ã¢ÂÂ Ã¯Â¸Â Tentative d'envoi d'email avortÃÂ©e : Service non configurÃÂ©.");
            console.log("Contenu du mail qui aurait dÃÂ» ÃÂªtre envoyÃÂ© :", mailOptions.subject);
            return { messageId: "fake-id", response: "Service disabled" };
        },
        verify: (cb) => cb(new Error("Service non configurÃÂ©"), null)
    };

    console.warn("Ã¢ÂÂ Ã¯Â¸Â SMTP non configurÃÂ© : EMAIL_USER ou EMAIL_PASS manquant.");
    logger.warn("Ã¢ÂÂ Ã¯Â¸Â Service email dÃÂ©sactivÃÂ© (identifiants manquants)");
}

export default transporter;
