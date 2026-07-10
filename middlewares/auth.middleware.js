// =======================================================
// auth.middleware.js
// Middleware d'authentification JWT pour la plateforme scolaire
// =======================================================

import jwt from "jsonwebtoken";
import { sequelize } from "../config/db.js";

// ------------------------------
// Vérification critique au démarrage : JWT_SECRET doit exister
// Évite de faire tourner l'app avec une signature JWT vide/faible
// ------------------------------
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.trim() === "") {
  throw new Error(
    "❌ JWT_SECRET manquant dans les variables d'environnement — arrêt du serveur pour éviter une faille de sécurité."
  );
}

// ------------------------------
// OPTION DEV : désactiver temporairement la vérification JWT
// Bloqué automatiquement si NODE_ENV = production, même si la variable traîne
// ------------------------------
const DISABLE_JWT =
  process.env.DISABLE_JWT === "true" && process.env.NODE_ENV !== "production";

/**
 * Fonction interne partagée : extrait, valide et décode le token.
 * Utilisée par `auth` et `requireAuth` pour éviter la duplication de logique.
 */
function verifyRequestToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    const err = new Error("Token manquant");
    err.status = 401;
    throw err;
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    const err = new Error("Format Authorization invalide");
    err.status = 401;
    throw err;
  }

  const token = parts[1];

  if (process.env.NODE_ENV === "development") {
    console.log("VERIFY TOKEN:", token.slice(0, 10) + "...");
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      const e = new Error("Token expiré");
      e.status = 401;
      throw e;
    }
    const e = new Error("Token invalide");
    e.status = 401;
    throw e;
  }

  if (!decoded.userId || !decoded.role) {
    const err = new Error("Payload JWT incomplet");
    err.status = 401;
    throw err;
  }

  return decoded;
}

/**
 * Middleware d'authentification standard (export par défaut).
 * Utilisé par Stripe Connect, Twilio, routes étudiant.
 */
export default function auth(req, res, next) {
  if (DISABLE_JWT) {
    console.warn(`⚠️ JWT désactivé (mode DEV) — ${req.method} ${req.originalUrl}`);
    req.user = { userId: "dev", role: "admin", email: "dev@example.com" };
    return next();
  }

  try {
    req.user = verifyRequestToken(req);
    next();
  } catch (err) {
    return res.status(err.status || 401).json({ message: err.message });
  }
}

/**
 * Middleware pour vérifier la présence d'un token JWT (format { ok, message }).
 * ATTENTION : ce middleware ne doit PAS protéger /login ni /refresh-token
 */
export function requireAuth(req, res, next) {
  if (DISABLE_JWT) {
    console.warn(`⚠️ JWT désactivé (mode DEV) — ${req.method} ${req.originalUrl}`);
    req.user = { userId: "dev", role: "admin", email: "dev@example.com" };
    return next();
  }

  try {
    req.user = verifyRequestToken(req);
    next();
  } catch (err) {
    return res.status(err.status || 401).json({ ok: false, message: err.message });
  }
}

/**
 * Middleware pour vérifier qu'un utilisateur a un rôle spécifique
 */
export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ ok: false, message: "Non authentifié" });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ ok: false, message: "Accès refusé" });
    }
    next();
  };
}

/**
 * Middleware de sécurité pour le Matching :
 * Bloque l'accès si un ÉTUDIANT n'a pas enregistré sa carte bancaire.
 */
export async function requireSubscription(req, res, next) {
  if (!req.user || !req.user.userId) {
    return res.status(401).json({ ok: false, message: "Non authentifié" });
  }

  // 🛠️ Mode DEV : On ignore la sécurité si DISABLE_JWT est actif (et pas en prod)
  if (DISABLE_JWT) {
    return next();
  }

  try {
    // 1. On récupère le statut et le rôle de l'utilisateur dans PostgreSQL
    const [user] = await sequelize.query(
      `SELECT subscription_status, is_subscriber, role 
       FROM users WHERE id = :userId`,
      {
        replacements: { userId: req.user.userId },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    if (!user) {
      return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });
    }

    // 2. Si ce n'est pas un étudiant (par exemple si c'est un Élève ou un Prof),
    // ce middleware ne le concerne pas, on passe à la suite.
    if (user.role !== "etudiant") {
      return next();
    }

    // 3. L'ÉTUDIANT a accès au matching s'il a enregistré sa carte (trial ou active)
    if (
      user.is_subscriber === true ||
      user.subscription_status === "trial" ||
      user.subscription_status === "active"
    ) {
      return next(); // Carte OK, on libère l'accès au matching !
    }

    // 4. Sinon, on bloque l'accès aux fonctionnalités de matching
    return res.status(403).json({
      ok: false,
      error_code: "SUBSCRIPTION_REQUIRED",
      message:
        "Accès refusé. Vous devez enregistrer votre carte bancaire (semaine gratuite) pour pouvoir accéder au matching entre étudiants.",
    });
  } catch (err) {
    console.error("❌ Erreur middleware requireSubscription:", err.message);
    return res
      .status(500)
      .json({ ok: false, message: "Erreur serveur lors de la vérification des accès de l'étudiant" });
  }
}

/**
 * Middleware spécifique pour l'admin
 */
export const requireAdmin = requireRole("admin");