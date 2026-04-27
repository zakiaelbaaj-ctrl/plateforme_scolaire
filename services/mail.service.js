// services/mail.service.js
import nodemailer from "nodemailer";
import logger from "../config/logger.js";

const defaultFrom =
  process.env.SMTP_FROM || '"Plateforme Scolaire" <no-reply@example.com>';

// ------------------------------------------------------
// 1. Vérification configuration SMTP
// ------------------------------------------------------
const smtpConfigured =
  process.env.SMTP_HOST &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS;

if (!smtpConfigured) {
  logger.warn("⚠️ SMTP not fully configured. Mailer will run in disabled mode.");
}

// ------------------------------------------------------
// 2. Création du transporteur
// ------------------------------------------------------
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls:
        process.env.SMTP_TLS_INSECURE === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    })
  : null;

if (transporter) {
  transporter.on("error", (err) => {
    logger.error("Mailer transport error", { message: err.message });
  });
}

// Helper pour nom affiché
function getDisplayName(user) {
  return (
    user.username ||
    `${user.prenom || ""} ${user.nom || ""}`.trim() ||
    "Utilisateur"
  );
}

// ------------------------------------------------------
// 3. Vérification du mailer
// ------------------------------------------------------
export async function verifyMailer() {
  if (!transporter) {
    logger.warn("Mailer disabled — verifyMailer skipped");
    return false;
  }

  try {
    await transporter.verify();
    logger.info("✅ Mailer ready");
    return true;
  } catch (err) {
    logger.error("❌ Mailer verification failed", {
      name: err?.name,
      message: err?.message,
    });
    throw err;
  }
}

// ------------------------------------------------------
// 4. Envoi email de bienvenue
// ------------------------------------------------------
export async function sendWelcomeEmail(user) {
  if (!transporter || process.env.MAILER_DISABLED === "true") {
    logger.info("Mailer disabled — welcome email skipped", { to: user.email });
    return;
  }

  const displayName = getDisplayName(user);

  try {
    await transporter.sendMail({
      from: defaultFrom,
      to: user.email,
      subject: "Bienvenue sur la plateforme",
      text: `Bonjour ${displayName}, bienvenue sur la plateforme !`,
      html: `<p>Bonjour <strong>${displayName}</strong>, bienvenue sur la plateforme !</p>`,
    });

    logger.info("Welcome email sent", { to: user.email });
  } catch (err) {
    logger.warn("sendWelcomeEmail failed", {
      name: err?.name,
      message: err?.message,
      to: user.email,
    });
    throw err;
  }
}
// ------------------------------------------------------
// 5. Envoi email de reset password
// ------------------------------------------------------
export async function sendResetPasswordEmail(user, token) {
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:4000";
  // Vérifie si ton fichier est bien reset_password.html ou reset-password
  const resetUrl = `${FRONTEND_URL}/reset_password.html?token=${token}`;

  if (!transporter || process.env.MAILER_DISABLED === "true") {
    logger.info("Mailer disabled — reset email skipped", { to: user.email });
    return;
  }

  const displayName = getDisplayName(user);

  try {
    await transporter.sendMail({
      from: defaultFrom,
      to: user.email,
      subject: "Réinitialisation de votre mot de passe",
      text: `Bonjour ${displayName}, utilisez ce lien pour réinitialiser votre mot de passe : ${resetUrl}`,
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>Réinitialisation de mot de passe</h2>
          <p>Bonjour <strong>${displayName}</strong>,</p>
          <p>Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour continuer :</p>
          <div style="margin: 25px 0;">
            <a href="${resetUrl}" 
               style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
               Changer mon mot de passe
            </a>
          </div>
          <p style="font-size: 0.8em; color: #666;">Ce lien est valable pendant 1 heure.</p>
          <p style="font-size: 0.8em; color: #666;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
        </div>
      `,
    });

    logger.info("Reset password email sent", { to: user.email });
  } catch (err) {
    logger.warn("sendResetPasswordEmail failed", {
      name: err?.name,
      message: err?.message,
      to: user.email,
    });
    throw err;
  }
}

// ------------------------------------------------------
// 4. NOUVEAU : Email de régularisation de paiement (SCA)
// ------------------------------------------------------
/**
 * Envoie un lien de paiement manuel si le prélèvement automatique échoue (SCA)
 */
export async function sendPaymentActionRequiredEmail(email, { amount, paymentUrl, duration }) {
  if (!transporter || process.env.MAILER_DISABLED === "true") {
    logger.info("Mailer disabled — payment recovery email skipped", { to: email });
    return;
  }

  try {
    await transporter.sendMail({
      from: defaultFrom,
      to: email,
      subject: "⚠️ Action requise : Validation de votre paiement",
      text: `Bonjour, votre dernier cours de ${duration} minutes d'un montant de ${amount}€ nécessite une validation bancaire. Merci de régler ici : ${paymentUrl}`,
      html: `
        <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
          <h2>Validation de paiement requise</h2>
          <p>Bonjour,</p>
          <p>Votre banque demande une confirmation pour le règlement de votre dernière session de cours :</p>
          <ul>
            <li><strong>Durée :</strong> ${duration} minutes</li>
            <li><strong>Montant :</strong> ${amount} €</li>
          </ul>
          <p>Merci de cliquer sur le bouton ci-dessous pour finaliser la transaction en toute sécurité :</p>
          <div style="margin: 30px 0;">
            <a href="${paymentUrl}" 
               style="background-color: #4F46E5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
               Régler ma session
            </a>
          </div>
          <p style="font-size: 0.9em; color: #666;">Si le bouton ne fonctionne pas, copiez-collez ce lien : <br> ${paymentUrl}</p>
        </div>
      `,
    });

    logger.info("✅ Payment recovery email sent", { to: email });
  } catch (err) {
    logger.error("❌ sendPaymentActionRequiredEmail failed", {
      to: email,
      message: err.message,
    });
    // On ne throw pas forcément ici pour ne pas bloquer le flux paymentService
  }
}
export async function sendInvoiceEmail(email, { invoiceNumber, amount, duration, fileName, displayName }) {
  if (!transporter || process.env.MAILER_DISABLED === "true") {
    logger.info("Mailer disabled — invoice email skipped", { to: email });
    return;
  }

  const invoiceUrl = `${process.env.FRONTEND_URL}/invoices/${fileName}`;

  try {
    await transporter.sendMail({
      from: defaultFrom,
      to: email,
      subject: `🧾 Votre facture de cours — ${invoiceNumber}`,
      html: `
        <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
          <h2>Votre facture de cours</h2>
          <p>Bonjour <strong>${displayName}</strong>,</p>
          <p>Merci pour votre session ! Voici le récapitulatif :</p>
          <ul>
            <li><strong>Durée :</strong> ${duration} minutes</li>
            <li><strong>Montant :</strong> ${amount.toFixed(2)} €</li>
            <li><strong>N° Facture :</strong> ${invoiceNumber}</li>
          </ul>
          <div style="margin: 25px 0;">
            <a href="${invoiceUrl}"
               style="background-color: #2563eb; color: white; padding: 10px 20px;
                      text-decoration: none; border-radius: 5px; font-weight: bold;">
              📄 Télécharger ma facture
            </a>
          </div>
          <p style="font-size: 0.8em; color: #666;">
            Si le bouton ne fonctionne pas : ${invoiceUrl}
          </p>
        </div>
      `,
    });
    logger.info("✅ Invoice email sent", { to: email, invoiceNumber });
  } catch (err) {
    logger.warn("sendInvoiceEmail failed", { to: email, message: err.message });
  }
}
export default transporter;
