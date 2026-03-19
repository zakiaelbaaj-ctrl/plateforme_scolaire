// --------------------------------------------------
// Middleware requireAdmin – Version professionnelle
// --------------------------------------------------

import logger from "#config/logger.js";
import * as usersService from "#services/usersService.js";

export async function requireAdmin(req, res, next) {
  try {
    // requireAuth doit avoir injecté req.user
    if (!req.user || !req.user.id) {
      logger.warn("Accès admin refusé : utilisateur non authentifié");
      return res.status(401).json({
        success: false,
        message: "Authentification requise"
      });
    }

    // Vérification du rôle dans la base (sécurité ++)
    const user = await usersService.findById(req.user.id);

    if (!user) {
      logger.warn("Accès admin refusé : utilisateur introuvable", {
        userId: req.user.id
      });
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    if (user.role !== "admin") {
      logger.warn("Accès admin refusé : rôle insuffisant", {
        userId: user.id,
        role: user.role
      });
      return res.status(403).json({
        success: false,
        message: "Accès réservé aux administrateurs"
      });
    }

    // Tout est OK → accès autorisé
    next();

  } catch (err) {
    logger.error("Erreur requireAdmin", {
      message: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la vérification des privilèges"
    });
  }
}
