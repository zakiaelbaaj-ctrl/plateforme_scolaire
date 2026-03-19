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
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
  const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`;

  if (!transporter || process.env.MAILER_DISABLED === "true") {
    logger.info("Mailer disabled — reset email skipped", { to: user.email });
    return;
  }

  const displayName = getDisplayName(user);

  try {
    await transporter.sendMail({
      from: defaultFrom,
      to: user.email,
      subject: "Réinitialisation de mot de passe",
      text: `Bonjour ${displayName}, utilisez ce lien pour réinitialiser votre mot de passe: ${resetUrl}`,
      html: `<p>Bonjour <strong>${displayName}</strong>,</p>
             <p>Utilisez ce lien pour réinitialiser votre mot de passe :</p>
             <a href="${resetUrl}">${resetUrl}</a>`,
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

export default transporter;
