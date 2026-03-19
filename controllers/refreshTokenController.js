// controllers/refreshTokenController.js
// --------------------------------------------------
// Gestion du refresh token – sécurisé & adapté
// --------------------------------------------------

import * as tokenService from "#services/token.service.js";
import logger from "#config/logger.js";

export async function refreshTokenController(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "refreshToken requis"
      });
    }

    // Vérifier si le refresh token existe en base
    const stored = await tokenService.getStoredRefreshToken(refreshToken);
    if (!stored) {
      return res.status(401).json({
        success: false,
        message: "Refresh token invalide ou révoqué"
      });
    }

    // Vérifier expiration
    if (new Date(stored.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        message: "Refresh token expiré"
      });
    }

    // Récupérer l'utilisateur associé
    const user = await tokenService.verifyRefreshToken(refreshToken);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur introuvable pour ce token"
      });
    }

    // Générer un nouveau couple accessToken + refreshToken
    const tokens = await tokenService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    return res.status(200).json({
      success: true,
      tokens
    });

  } catch (err) {
    logger.error("refreshTokenController error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors du rafraîchissement du token"
    });
  }
}
