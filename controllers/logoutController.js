// controllers/logoutController.js
// --------------------------------------------------
// Déconnexion utilisateur – sécurisé & adapté
// --------------------------------------------------

import * as tokenService from "#services/token.service.js";
import logger from "#config/logger.js";

export async function logoutController(req, res) {
  try {
    // Le refresh token peut venir du body ou du cookie
    const refreshToken =
      req.body?.refreshToken || req.cookies?.refreshToken;

    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken);
    }

    // Nettoyage du cookie si utilisé
    res.clearCookie?.("refreshToken", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production"
    });

    return res.status(200).json({
      success: true,
      message: "Déconnecté"
    });

  } catch (err) {
    logger.error("logoutController error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la déconnexion"
    });
  }
}
