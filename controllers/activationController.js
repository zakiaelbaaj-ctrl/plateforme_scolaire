// controllers/activationController.js
import logger from "#config/logger.js";
import crypto from "crypto";
import * as authService from "#services/auth.service.js";
import * as usersService from "#services/usersService.js";
import * as mailService from "#services/mail.service.js";

const ACTIVATION_TOKEN_VALIDITY_MS = 24 * 60 * 60 * 1000; // 24h

// ---------------- ACTIVATE ACCOUNT ----------------
export async function activateAccountController(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ success: false, message: "Jeton d'activation requis" });
    }

    const user = await authService.findByActivationToken(token);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Lien d'activation invalide ou expiré"
      });
    }

    await authService.activateUser(user.id);

    logger.info("✅ Compte activé", { userId: user.id, email: user.email });

    return res.status(200).json({
      success: true,
      message: "Compte activé avec succès"
    });

  } catch (err) {
    logger.error("activateAccountController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// ---------------- RESEND ACTIVATION ----------------
export async function resendActivationController(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email requis" });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await usersService.findByEmail(cleanEmail);

    // ✅ Réponse identique que le compte existe ou non, et qu'il soit déjà
    // activé ou non — évite de révéler à un tiers si un email est inscrit.
    const genericResponse = {
      success: true,
      message: "Si un compte existe pour cet email, un nouveau lien vient d'être envoyé."
    };

    if (!user || user.is_active) {
      return res.status(200).json(genericResponse);
    }

    const isStudent = (user.role === "eleve" || user.role === "etudiant");
    if (!isStudent) {
      // Les profs suivent le circuit de validation admin, pas l'email
      return res.status(200).json(genericResponse);
    }

    const activationToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + ACTIVATION_TOKEN_VALIDITY_MS);
    await authService.setActivationToken(user.id, activationToken, expires);

    mailService.sendActivationEmail(user, activationToken).catch(() => {});

    logger.info("📧 Renvoi lien d'activation", { userId: user.id, email: cleanEmail });

    return res.status(200).json(genericResponse);

  } catch (err) {
    logger.error("resendActivationController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}