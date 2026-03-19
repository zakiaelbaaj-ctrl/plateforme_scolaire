// controllers/resetPasswordController.js
// --------------------------------------------------
// Réinitialisation du mot de passe – sécurisé & adapté
// --------------------------------------------------

import * as authService from "#services/auth.service.js";
import * as tokenService from "#services/token.service.js";
import logger from "#config/logger.js";

export async function resetPasswordController(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Token et nouveau mot de passe requis"
      });
    }

    // Vérifier le token en base
    const record = await authService.findByResetToken(token);

    if (!record) {
      return res.status(400).json({
        success: false,
        message: "Token invalide"
      });
    }

    // Vérifier expiration
    if (record.resetTokenExpires < Date.now()) {
      return res.status(400).json({
        success: false,
        message: "Token expiré"
      });
    }

    // Mettre à jour le mot de passe
    await authService.updatePassword(record.userId, newPassword);

    // Supprimer le token de reset
    await authService.clearResetToken(record.userId);

    // Révoquer tous les refresh tokens de cet utilisateur
    tokenService.revokeAllRefreshTokensForUser(record.userId).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Mot de passe réinitialisé avec succès"
    });

  } catch (err) {
    logger.error("resetPasswordController error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}
