// =======================================================
// services/token.service.js
// Gestion JWT et Refresh Tokens pour la plateforme scolaire
// =======================================================

import jwt from "jsonwebtoken";
import { sequelize as db } from "../config/index.js";
import { QueryTypes } from "sequelize";
import crypto from "crypto";
import logger from "../config/logger.js";

// ------------------------------
// OPTION DEV : désactiver temporairement la vérification JWT
// ------------------------------
const DISABLE_JWT = process.env.DISABLE_JWT === "true";

// ------------------------------
// CONSTANTES DYNAMIQUES
// ------------------------------
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET non défini dans .env !");
  return secret;
}

function getJwtExpiration() {
  // Access token très long : 30 jours
  return process.env.JWT_EXPIRATION || "30d";
}

function getRefreshExpiration() {
  // Refresh token encore plus long : 90 jours
  return process.env.REFRESH_TOKEN_EXPIRATION
    ? parseInt(process.env.REFRESH_TOKEN_EXPIRATION, 10)
    : 90 * 24 * 60 * 60 * 1000; // 90 jours par défaut en ms
}

// ------------------------------
// GENERATION DES TOKENS
// ------------------------------
export async function generateTokens({ userId, email, role }) {
  if (!userId) throw new Error("userId manquant pour générer le token");

  if (DISABLE_JWT) {
    logger.warn("⚠️ Génération JWT désactivée (mode DEV)");
    return { accessToken: "dev-access-token", refreshToken: "dev-refresh-token" };
  }

  try {
    const JWT_SECRET = getJwtSecret();
    const JWT_EXPIRATION = getJwtExpiration();
    const REFRESH_EXPIRATION = getRefreshExpiration();

    // 🔹 Access token
    const accessToken = jwt.sign({ userId, email, role }, JWT_SECRET, { expiresIn: JWT_EXPIRATION });

    // 🔹 Refresh token aléatoire
    const refreshToken = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRATION);

    // 🔹 Stockage du refresh token dans la DB
    await db.query(
      `INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)`,
      { replacements: [refreshToken, userId, expiresAt], type: QueryTypes.INSERT }
    );

    logger.info(`Refresh token généré pour utilisateur ${userId}`);
    return { accessToken, refreshToken };

  } catch (err) {
    logger.error("generateTokens error:", err);
    throw err;
  }
}

// ------------------------------
// VERIFICATION DES TOKENS
// ------------------------------
export function verifyAccessToken(token) {
  if (DISABLE_JWT) {
    logger.warn("⚠️ Vérification JWT désactivée (mode DEV)");
    return { userId: "dev", role: "admin", email: "dev@example.com" };
  }
  try {
    const JWT_SECRET = getJwtSecret();
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    logger.warn("Access token invalide:", err.message);
    return null;
  }
}

export async function verifyRefreshToken(token) {
  if (DISABLE_JWT) {
    logger.warn("⚠️ Vérification Refresh JWT désactivée (mode DEV)");
    return { userId: "dev", role: "admin", email: "dev@example.com" };
  }
  try {
    const record = await getStoredRefreshToken(token);
    if (!record) return null;
    if (new Date(record.expires_at) < new Date()) return null;

    const [userRows] = await db.query(
      `SELECT id, email, role, username FROM users WHERE id = ?`,
      { replacements: [record.user_id], type: QueryTypes.SELECT }
    );

    return userRows[0] || null;
  } catch (err) {
    logger.error("verifyRefreshToken error:", err);
    return null;
  }
}

// ------------------------------
// REVOCATION DES TOKENS
// ------------------------------
export async function revokeRefreshToken(token) {
  if (DISABLE_JWT) return logger.warn("⚠️ Revocation ignorée (mode DEV)");

  try {
    await db.query(`DELETE FROM refresh_tokens WHERE token = ?`, { replacements: [token], type: QueryTypes.DELETE });
    logger.info("Refresh token révoqué");
  } catch (err) {
    logger.error("revokeRefreshToken error:", err);
    throw err;
  }
}

export async function revokeAllRefreshTokensForUser(userId) {
  if (DISABLE_JWT) return logger.warn("⚠️ Revocation ignorée (mode DEV)");

  try {
    await db.query(`DELETE FROM refresh_tokens WHERE user_id = ?`, { replacements: [userId], type: QueryTypes.DELETE });
    logger.info(`Tous les refresh tokens révoqués pour utilisateur ${userId}`);
  } catch (err) {
    logger.error("revokeAllRefreshTokensForUser error:", err);
    throw err;
  }
}

// ------------------------------
// OBTENIR UN REFRESH TOKEN DE LA BASE
// ------------------------------
export async function getStoredRefreshToken(token) {
  if (DISABLE_JWT) return { user_id: "dev", expires_at: new Date(Date.now() + 90*24*60*60*1000) }; // 90 jours

  try {
    const rows = await db.query(`SELECT * FROM refresh_tokens WHERE token = ?`, { replacements: [token], type: QueryTypes.SELECT });
    return Array.isArray(rows) ? rows[0] || null : null;
  } catch (err) {
    logger.error("getStoredRefreshToken error:", err);
    return null;
  }
}
