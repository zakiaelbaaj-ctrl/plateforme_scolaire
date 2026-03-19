// =======================================================
// auth.middleware.js
// Middleware d'authentification JWT pour la plateforme scolaire
// =======================================================

import jwt from "jsonwebtoken";

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
 * Middleware spécifique pour l'admin
 */
export const requireAdmin = requireRole("admin");
