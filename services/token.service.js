// services/token.service.js
import jwt from "jsonwebtoken";
import { sequelize as db } from "../config/index.js";
import { QueryTypes } from "sequelize";
import crypto from "crypto";
import logger from "../config/logger.js";

const DISABLE_JWT = process.env.DISABLE_JWT === "true";

// --- HELPERS ---
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET non défini dans le fichier .env !");
  return secret;
}
// --- VERIFICATION DE L'ACCESS TOKEN (JWT) ---
export function verifyAccessToken(token) {
  if (DISABLE_JWT) {
    return { id: "dev", userId: "dev", role: "admin", email: "dev@example.com" };
  }
  try {
    const secret = getJwtSecret();
    const decoded = jwt.verify(token, secret);
    
    // On garantit que l'objet contient "id" même si le payload contenait "userId"
    return { 
      ...decoded, 
      id: decoded.id || decoded.userId 
    };
  } catch (err) {
    // Si le token est expiré ou corrompu, on log l'info discrètement et on renvoie null
    logger.debug("Access Token verification failed:", err.message);
    return null;
  }
}

// --- GENERATION DES TOKENS ---
export async function generateTokens({ userId, email, role }) {
  if (!userId) throw new Error("userId manquant pour générer les tokens");

  if (DISABLE_JWT) {
    logger.warn("⚠️ Mode DEV : Génération de tokens factices");
    return { accessToken: "dev-access-token", refreshToken: "dev-refresh-token" };
  }

  try {
    const JWT_SECRET = getJwtSecret();
    const JWT_EXPIRATION = process.env.JWT_EXPIRATION || "30d";
    
    // On inclut "id" et "userId" pour être compatible avec tous les controllers
    const payload = { id: userId, userId, email, role };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });

    // Génération du Refresh Token (opaque)
    const refreshToken = crypto.randomBytes(40).toString("hex");
    const expiresAt = new Date(Date.now() + (90 * 24 * 60 * 60 * 1000)); // 90 jours

    // Insertion PostgreSQL
    await db.query(
      `INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)`,
      { 
        bind: [refreshToken, userId, expiresAt], 
        type: QueryTypes.INSERT 
      }
    );

    return { accessToken, refreshToken };
  } catch (err) {
    logger.error("generateTokens error:", err);
    throw err;
  }
}

// --- VERIFICATION DU REFRESH TOKEN ---
export async function verifyRefreshToken(token) {
  if (DISABLE_JWT) return { id: "dev", userId: "dev", role: "admin", email: "dev@example.com" };

  try {
    // 1. Chercher le token en base
    const rows = await db.query(
      `SELECT user_id, expires_at FROM refresh_tokens WHERE token = $1`, 
      { bind: [token], type: QueryTypes.SELECT }
    );
    
    const record = rows[0];
    if (!record || new Date(record.expires_at) < new Date()) {
      return null;
    }

    // 2. Récupérer l'utilisateur associé
    const userRows = await db.query(
      `SELECT id, email, role, username, is_active FROM users WHERE id = $1`,
      { bind: [record.user_id], type: QueryTypes.SELECT }
    );

    const user = userRows[0];
    
    // Sécurité : l'utilisateur doit exister ET être actif
    if (!user || user.is_active === false) {
      return null;
    }

    // On retourne l'utilisateur avec les deux formats d'ID
    return { ...user, userId: user.id }; 
  } catch (err) {
    logger.error("verifyRefreshToken error:", err);
    return null;
  }
}

// --- REVOCATION ---
export async function revokeRefreshToken(token) {
  if (DISABLE_JWT) return;
  try {
    await db.query(`DELETE FROM refresh_tokens WHERE token = $1`, { 
      bind: [token], 
      type: QueryTypes.DELETE 
    });
  } catch (err) {
    logger.error("revokeRefreshToken error:", err);
  }
}

export async function revokeAllRefreshTokensForUser(userId) {
  if (DISABLE_JWT) return;
  try {
    await db.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, { 
      bind: [userId], 
      type: QueryTypes.DELETE 
    });
  } catch (err) {
    logger.error("revokeAllRefreshTokensForUser error:", err);
  }
}
