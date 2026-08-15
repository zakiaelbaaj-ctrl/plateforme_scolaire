import { Resend } from "resend";
import logger from "../config/logger.js";

const resend = new Resend(process.env.RESEND_API_KEY);
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
// ------------------------------------------------------
// Email session trop courte (non facturée)
// ------------------------------------------------------
export async function sendSessionTooShortEmail(email, { duration, studentName, displayName }) {
  return sendEmail({
    to: email,
    subject: "ℹ️ Session non facturée — durée trop courte",
    text: `Bonjour ${displayName}, votre session avec ${studentName} a duré ${duration} minute(s), en dessous du seuil minimum de facturation. Cette session n'a donc pas pu être facturée ni vous être rémunérée. Si vous pensez qu'il s'agit d'une erreur, contactez le support.`,
    html: `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #e65100;">ℹ️ Session non facturée</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <p>Votre session avec <strong>${studentName}</strong> a duré <strong>${duration} minute${duration > 1 ? "s" : ""}</strong>, 
        ce qui est en dessous du seuil minimum requis pour être facturée.</p>
        <p>Cette session n'a donc pas pu être facturée à l'élève, et vous ne serez pas rémunéré(e) pour celle-ci.</p>
        <p style="font-size: 0.85em; color: #666; margin-top: 25px;">
          Si vous pensez qu'il s'agit d'une erreur (par exemple un problème technique ayant écourté la session), 
          contactez notre équipe support.
        </p>
      </div>
    `
  });
}
// ------------------------------------------------------
// Email activation compte professeur
// ------------------------------------------------------
export async function sendProfActivatedEmail(user) {
  const displayName = getDisplayName(user);
  const FRONTEND_URL = process.env.FRONTEND_URL || "https://urgencescolaire.com";
  const loginUrl = `${FRONTEND_URL}/pages/professeur/login.html`;
  const stripeSetupUrl = `${FRONTEND_URL}/pages/professeur/dashboard.html?stripe=setup`;

  return sendEmail({
    to: user.email,
    subject: "✅ Votre compte professeur a été activé !",
    text: `Bonjour ${displayName}, votre compte a été validé par notre équipe. Connectez-vous dès maintenant pour apparaître dans la liste des professeurs disponibles et recevoir des appels d'élèves. Important : le partage d'écran n'est pas disponible sur téléphone mobile — l'utilisation d'un ordinateur est donc fortement conseillée pour le bon déroulement de vos cours. N'oubliez pas de configurer votre compte Stripe pour recevoir vos paiements : ${stripeSetupUrl}. Connexion : ${loginUrl}`,
    html: `
      <div style="font-family: sans-serif; color: #333; line-height: 1.6;">
        <h2 style="color: #2e7d32;">🎉 Votre compte a été activé !</h2>
        <p>Bonjour <strong>${displayName}</strong>,</p>
        <p>Bonne nouvelle : votre dossier a été examiné et validé par notre équipe. Vous pouvez désormais accéder à votre espace professeur.</p>

        <h3 style="margin-top: 24px;">📋 Comment ça marche ?</h3>
        <ol>
          <li>Connectez-vous à votre espace professeur.</li>
          <li>Une fois connecté, vous apparaissez automatiquement dans la liste des professeurs disponibles.</li>
          <li>Un élève peut alors vous appeler à tout moment.</li>
          <li>Répondez à l'appel pour démarrer la séance de cours.</li>
        </ol>

        <div style="margin: 25px 0;">
          <a href="${loginUrl}"
             style="background-color: #2563eb; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Me connecter
          </a>
        </div>

        <h3 style="margin-top: 24px; color: #1565c0;">💻 Bon à savoir avant votre premier cours</h3>
        <p>
          L'utilisation d'un <strong>ordinateur est fortement conseillée</strong> pour le bon déroulement de vos cours.
          En effet, le partage d'écran (utile pour montrer un document, un exercice ou une correction) 
          n'est pas disponible sur téléphone mobile en raison de limitations techniques propres à iOS et Android.
        </p>
        <p style="font-size: 0.9em; color: #555;">
          Vous pouvez tout de même donner cours depuis une tablette ou un smartphone si besoin — 
          seule la fonctionnalité de partage d'écran sera alors indisponible.
        </p>

        <h3 style="margin-top: 24px; color: #e65100;">💳 Étape indispensable : configurer votre compte Stripe</h3>
        <p>
          Pour recevoir le paiement de vos séances, vous devez impérativement configurer votre compte
          Stripe depuis votre tableau de bord. Sans cette étape, vous ne pourrez pas percevoir votre salaire.
        </p>
        <div style="margin: 25px 0;">
          <a href="${stripeSetupUrl}"
             style="background-color: #635bff; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
             Configurer mon compte Stripe
          </a>
        </div>

        <p style="font-size: 0.85em; color: #666; margin-top: 30px;">
          Si vous avez la moindre question, n'hésitez pas à contacter notre équipe support.
        </p>
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