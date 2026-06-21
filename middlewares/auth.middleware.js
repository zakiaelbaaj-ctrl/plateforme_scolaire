// =======================================================
// auth.middleware.js
// Middleware d'authentification JWT pour la plateforme scolaire
// =======================================================

import jwt from "jsonwebtoken";
import { sequelize } from "../config/db.js";
export default function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ message: "Token manquant" });

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Token invalide" });
  }
}


// ------------------------------
// OPTION DEV : désactiver temporairement la vérification JWT
// ------------------------------
const DISABLE_JWT = process.env.DISABLE_JWT === "true";

/**
 * Middleware pour vérifier la présence d'un token JWT
 * ATTENTION : ce middleware ne doit PAS protéger /login ni /refresh-token
 */
export function requireAuth(req, res, next) {
  // 🔥 Mode DEV : bypass JWT
  if (DISABLE_JWT) {
    console.warn("⚠️ Vérification JWT désactivée (mode DEV)");
    // On simule un utilisateur admin pour le DEV
    req.user = { userId: "dev", role: "admin", email: "dev@example.com" };
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ ok: false, message: "Token manquant" });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ ok: false, message: "Format Authorization invalide" });
  }

  const token = parts[1];
  console.log("VERIFY TOKEN:", token); // Pour debug en DEV

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.userId || !decoded.role) {
      return res.status(401).json({ ok: false, message: "Payload JWT incomplet" });
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ ok: false, message: "Token expiré" });
    }
    return res.status(401).json({ ok: false, message: "Token invalide" });
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

  // 🛠️ Mode DEV : On ignore la sécurité si DISABLE_JWT est actif
  if (process.env.DISABLE_JWT === "true") {
    return next();
  }

  try {
    // 1. On récupère le statut et le rôle de l'utilisateur dans PostgreSQL
    const [user] = await sequelize.query(
      `SELECT subscription_status, is_subscriber, role 
       FROM users WHERE id = :userId`,
      { 
        replacements: { userId: req.user.userId }, 
        type: sequelize.QueryTypes.SELECT 
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
    if (user.is_subscriber === true || user.subscription_status === "trial" || user.subscription_status === "active") {
      return next(); // Carte OK, on libère l'accès au matching !
    }

    // 4. Sinon, on bloque l'accès aux fonctionnalités de matching
    return res.status(403).json({ 
      ok: false, 
      error_code: "SUBSCRIPTION_REQUIRED",
      message: "Accès refusé. Vous devez enregistrer votre carte bancaire (semaine gratuite) pour pouvoir accéder au matching entre étudiants." 
    });

  } catch (err) {
    console.error("❌ Erreur middleware requireSubscription:", err.message);
    return res.status(500).json({ ok: false, message: "Erreur serveur lors de la vérification des accès de l'étudiant" });
  }
}
/**
 * Middleware spécifique pour l'admin
 */
export const requireAdmin = requireRole("admin");
