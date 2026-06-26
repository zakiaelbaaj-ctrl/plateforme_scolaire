import { Resend } from "resend";
import logger from "../config/logger.js";

const resend = new Resend(process.env.RESEND_API_KEY);
console.log("🔑 RESEND_API_KEY:", process.env.RESEND_API_KEY?.slice(0, 10) + "...");
const defaultFrom = process.env.RESEND_FROM || "Plateforme Scolaire <noreply@urgencescolaire.com>";

// ------------------------------------------------------
// Vérification configuration
// ------------------------------------------------------
if (!process.env.RESEND_API_KEY) {
  logger.warn("⚠️ RESEND_API_KEY non configurée. Emails désactivés.");
}

// Helper
function getDisplayName(user) {
  return user.username || `${user.prenom || ""} ${user.nom || ""}`.trim() || "Utilisateur";
}

// ------------------------------------------------------
// Envoi générique
// ------------------------------------------------------
async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY || process.env.MAILER_DISABLED === "true") {
    logger.info("Mailer disabled — email skipped", { to });
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: defaultFrom,
      to,
      subject,
      html,
      text
    });

    if (error) {
      logger.warn("Resend error:", { to, error });
      throw new Error(error.message);
    }

    logger.info("✅ Email sent via Resend", { to, id: data?.id });
    return data;

  } catch (err) {
    logger.warn("sendEmail failed:", { to, message: err.message });
    throw err;
  }
}

// ------------------------------------------------------
// Email de bienvenue
// ------------------------------------------------------
export async function sendWelcomeEmail(user) {
  const displayName = getDisplayName(user);
  return sendEmail({
    to: user.email,
    subject: "Bienvenue sur la plateforme",
    text: `Bonjour ${displayName}, bienvenue sur la plateforme !`,
    html: `<p>Bonjour <strong>${displayName}</strong>, bienvenue sur la plateforme !</p>`
  });
}

// ------------------------------------------------------
// Email reset password
// ------------------------------------------------------
export async function sendResetPasswordEmail(user, token) {
  const FRONTEND_URL = process.env.FRONTEND_URL || "https://urgencescolaire.com";
  const resetUrl = `${FRONTEND_URL}/reset_password.html?token=${token}`;
  const displayName = getDisplayName(user);

  return sendEmail({
    to: user.email,
    subject: "Réinitialisation de votre mot de passe",
    text: `Bonjour ${displayName}, utilisez ce lien pour réinitialiser votre mot de passe : ${resetUrl}`,
    html: `
      <div style="font-family: sans-serif; color: #333;">
        <h2>Réinitialisation de mot de passe</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <p>Cliquez sur le bouton ci-dessous pour réinitialiser votre mot de passe :</p>
        <div style="margin: 25px 0;">
          <a href="${resetUrl}" 
             style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Changer mon mot de passe
          </a>
        </div>
        <p style="font-size: 0.8em; color: #666;">Ce lien est valable pendant 1 heure.</p>
        <p style="font-size: 0.8em; color: #666;">Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
      </div>
    `
  });
}

// ------------------------------------------------------
// Email match trouvé
// ------------------------------------------------------
export async function sendMatchFoundEmail(user, partnerName) {
  const displayName = getDisplayName(user);
  const dashboardUrl = `${process.env.FRONTEND_URL}/pages/etudiant/dashboard.html`;

  return sendEmail({
    to: user.email,
    subject: "🎓 Match trouvé ! Un partenaire vous attend",
    text: `Bonjour ${displayName}, vous avez un match avec ${partnerName} ! Rejoignez la session ici : ${dashboardUrl}`,
    html: `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #4F46E5;">🎉 Match trouvé !</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <p>Un partenaire a été trouvé : <strong>${partnerName}</strong></p>
        <div style="margin: 30px 0;">
          <a href="${dashboardUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Rejoindre la session
          </a>
        </div>
      </div>
    `
  });
}

// ------------------------------------------------------
// Email paiement action requise
// ------------------------------------------------------
export async function sendPaymentActionRequiredEmail(email, { amount, paymentUrl, duration }) {
  return sendEmail({
    to: email,
    subject: "⚠️ Action requise : Validation de votre paiement",
    text: `Votre cours de ${duration} min (${amount}€) nécessite une validation bancaire : ${paymentUrl}`,
    html: `
      <div style="font-family: sans-serif; line-height: 1.5; color: #333;">
        <h2>Validation de paiement requise</h2>
        <p>Votre banque demande une confirmation pour votre session :</p>
        <ul>
          <li><strong>Durée :</strong> ${duration} minutes</li>
          <li><strong>Montant :</strong> ${amount} €</li>
        </ul>
        <div style="margin: 30px 0;">
          <a href="${paymentUrl}" 
             style="background-color: #4F46E5; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Régler ma session
          </a>
        </div>
      </div>
    `
  });
}

// ------------------------------------------------------
// Email facture élève
// ------------------------------------------------------
export async function sendInvoiceEmail(email, { invoiceNumber, amount, duration, fileName, displayName }) {
  const invoiceUrl = `${process.env.FRONTEND_URL}/invoices/${fileName}`;

  return sendEmail({
    to: email,
    subject: `🧾 Votre facture de cours — ${invoiceNumber}`,
    html: `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <h2>Votre facture de cours</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <ul>
          <li><strong>Durée :</strong> ${duration} minutes</li>
          <li><strong>Montant :</strong> ${amount.toFixed(2)} €</li>
          <li><strong>N° Facture :</strong> ${invoiceNumber}</li>
        </ul>
        <div style="margin: 25px 0;">
          <a href="${invoiceUrl}"
             style="background-color: #2563eb; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">
            📄 Télécharger ma facture
          </a>
        </div>
      </div>
    `
  });
}

// ------------------------------------------------------
// Email paiement prof
// ------------------------------------------------------
export async function sendProfPaymentEmail(email, { invoiceNumber, amount, duration, displayName }) {
  return sendEmail({
    to: email,
    subject: `💰 Paiement reçu pour votre session — ${invoiceNumber}`,
    html: `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <h2>Paiement reçu ✅</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <ul>
          <li><strong>Durée :</strong> ${duration} minutes</li>
          <li><strong>Montant perçu :</strong> ${amount.toFixed(2)} €</li>
          <li><strong>N° :</strong> ${invoiceNumber}</li>
        </ul>
        <p style="font-size: 0.8em; color: #666;">Versement sous 2-3 jours ouvrés.</p>
      </div>
    `
  });
}

export async function verifyMailer() {
  if (!process.env.RESEND_API_KEY) {
    logger.warn("Mailer disabled — verifyMailer skipped");
    return false;
  }
  logger.info("✅ Resend mailer ready");
  return true;
}

export default resend;