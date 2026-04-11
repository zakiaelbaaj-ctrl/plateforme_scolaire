// --------------------------------------------------
// Middleware requireAuth – Version propre et corrigée
// --------------------------------------------------

import * as tokenService from "#services/token.service.js";
import * as usersService from "#services/usersService.js";
import logger from "#config/logger.js";

export async function requireAuth(req, res, next) {
  try {

    // --------------------------------------------------
    // MODE DEV : bypass complet de l'authentification
    // --------------------------------------------------
    if (process.env.DISABLE_JWT === "true") {
      req.user = {
        id: 1,
        email: "dev@example.com",
        role: "admin",
        prenom: "Dev",
        nom: "Mode",
        statut: "active" // ✅ Change "valide" par "active" ici aussi
      };

      logger.warn("⚠️ Authentification désactivée (DISABLE_JWT=true)");
      return next();
    }
    // --------------------------------------------------
    // 1. Extraction du token Bearer
    // --------------------------------------------------
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      logger.warn("Accès refusé : token manquant");
      return res.status(401).json({
        success: false,
        message: "Token d'authentification requis"
      });
    }

    // --------------------------------------------------
    // 2. Vérification du token JWT
    // --------------------------------------------------
    const payload = await tokenService.verifyAccessToken(token);

    if (!payload || !payload.userId) {
      logger.warn("Accès refusé : token invalide ou expiré");
      return res.status(401).json({
        success: false,
        message: "Token invalide ou expiré"
      });
    }

    // --------------------------------------------------
    // 3. Récupération de l'utilisateur
    // --------------------------------------------------
    const user = await usersService.findById(payload.userId);

    if (!user) {
      logger.warn("Accès refusé : utilisateur introuvable", {
        userId: payload.userId
      });
      return res.status(401).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    // --------------------------------------------------
    // 4. Vérification du statut professeur (CORRIGÉ ✅)
    // --------------------------------------------------
    if (user.role === "prof" && (!user.statut || user.statut.toLowerCase().trim() !== "active")) {
      logger.warn("Accès refusé : professeur non validé", {
        userId: user.id,
        statut: user.statut
      });
      return res.status(403).json({
        success: false,
        message: "Votre compte professeur est en attente de validation par l'administration."
      });
    }

    // --------------------------------------------------
    // 5. Injection sécurisée dans req.user
    // --------------------------------------------------
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      prenom: user.prenom,
      nom: user.nom,
      statut: user.statut
    };

    next();

  } catch (err) {
    logger.error("❌ requireAuth error", {
      message: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de l'authentification"
    });
  }
}
