// --------------------------------------------------
// Middleware requireRole – Version professionnelle
// --------------------------------------------------

import { requireAuth } from "#middlewares/requireAuth.js";

/**
 * Middleware pour vérifier si l'utilisateur connecté a le rôle spécifié.
 * Nécessite que requireAuth ait déjà été exécuté pour que req.user soit défini.
 * @param {string} role - Le rôle requis (ex : 'admin', 'prof', etc.)
 */
export function requireRole(role) {
  return (req, res, next) => {
    // Vérification que l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    // Vérification du rôle de l'utilisateur
    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: "Accès refusé : rôle insuffisant"
      });
    }

    // Si tout est ok, on passe au middleware suivant
    next();
  };
}
