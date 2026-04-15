import crypto from "crypto";
import * as authService from "#services/auth.service.js";
import * as mailService from "#services/mail.service.js";
import logger from "#config/logger.js";

export async function forgotPasswordController(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email requis" });
    }

    const user = await authService.findByEmail(email);

    // Anti-fingerprinting : on renvoie le même message même si l'utilisateur n'existe pas
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "Si cet email existe, un lien de réinitialisation a été envoyé"
      });
    }

    // 1. Générer un token sécurisé
    const token = crypto.randomBytes(32).toString("hex");

    // 2. Sauvegarder le token (le service gère désormais l'expiration de 1h)
    await authService.saveResetToken(user.id, token); // <-- MODIFIÉ ICI

    // 3. Envoi de l'email (non bloquant)
    mailService.sendResetPasswordEmail(user, token).catch(err =>
      logger.warn("sendResetPasswordEmail failed:", { to: email, error: err?.message })
    );

    return res.status(200).json({
      success: true,
      message: "Si cet email existe, un lien de réinitialisation a été envoyé"
    });

  } catch (err) {
    logger.error("forgotPasswordController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}