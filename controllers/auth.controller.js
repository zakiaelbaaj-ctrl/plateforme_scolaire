import bcrypt from "bcryptjs";
import crypto from "crypto";
import Stripe from "stripe";
import logger from "#config/logger.js";
import * as authService from "#services/auth.service.js";
import * as tokenService from "#services/token.service.js";
import * as mailService from "#services/mail.service.js"; // Gardé une seule fois ici
import { validationResult } from "express-validator";
// Initialisation de Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
// Filtre pour ne jamais exposer mot de passe ou tokens
function sanitizeUser(user) {
  if (!user) return null;

  // 1. Vérifie si c'est une instance Sequelize (possède dataValues et toJSON)
  // ou si c'est déjà un objet plat (issu d'une requête SQL brute db.query)
  const userJson = (user && typeof user.toJSON === 'function') 
    ? user.toJSON() 
    : user;
  
  // 2. Déstructuration sécurisée sur l'objet converti
  const { 
    password, 
    resetToken, 
    resetTokenExpires, 
    stripe_customer_id, 
    stripe_account_id, 
    ...safe 
  } = userJson;
  
  return safe;
}
// ---------------- LOGIN ----------------
export async function loginController(req, res) {
  try {

    const { email, username, password } = req.body;

    // 1. Recherche de l'utilisateur
    // On passe 'true' en deuxième argument pour inclure le password via Sequelize
    let user;
if (email) {
  user = await authService.findByEmail(email, true);
} else if (username) {
  // ✅ Détecte si c'est un email ou un username
  const isEmail = username.includes("@");
  if (isEmail) {
    user = await authService.findByEmail(username, true); // ✅ cherche par email
  } else {
    user = await authService.findByUsernameWithPassword(username);
  }
}
    // 2. Vérifications de base
    if (!user) {
      return res.status(401).json({ success: false, message: "Utilisateur ou mot de passe invalide" });
    }

    // 3. Vérification du statut (Spécifique aux professeurs)
    // Note : Avec Sequelize, user est une instance, on y accède normalement
        if (!user.is_active) {
      const isStudent = (user.role === "eleve" || user.role === "etudiant");
      return res.status(403).json({ 
        success: false, 
        message: isStudent
          ? "Votre compte n'est pas encore activé. Vérifiez votre boîte mail ou demandez un nouveau lien d'activation."
          : "Votre compte est en attente de validation par l'administrateur.",
        code: isStudent ? "ACCOUNT_NOT_ACTIVATED" : "ACCOUNT_PENDING_APPROVAL"
      });
    }

    // 4. Comparaison du mot de passe
    const valid = await authService.comparePassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Utilisateur ou mot de passe invalide" });
    }
      // 🔒 Vérification Stripe : élève doit avoir une carte
let has_payment_method = false;

if (user.role === "eleve" || user.role === "etudiant") {
  if (user.stripe_customer_id) {
    try {
      const customer = await stripe.customers.retrieve(user.stripe_customer_id);
      // Vérifie que le customer n'est pas supprimé côté Stripe
      if (!customer.deleted) {
        has_payment_method = !!customer.invoice_settings?.default_payment_method;
      }
    } catch (stripeErr) {
      // Customer introuvable ou erreur Stripe → on continue sans bloquer le login
      console.warn("⚠️ Stripe customer introuvable pour user", user.id, stripeErr.message);
      has_payment_method = false;
    }
  }
}
    // 5. Génération des tokens
    // On utilise user.id et user.email directement depuis l'instance Sequelize
    const tokens = await tokenService.generateTokens({ 
      userId: user.id, 
      role: user.role 
    });

    // 6. Réponse (On transforme l'instance en JSON pur pour sanitizeUser)
    
    // 1. Convertir l'instance Sequelize en JSON pur
    const userData = user.get({ plain: true });

    // 2. Forcer la valeur fraîchement calculée depuis Stripe dans l'objet
    userData.has_payment_method = has_payment_method; 

    // 3. Nettoyer (enlever password, etc.) et envoyer
    return res.json({ 
      success: true, 
      user: sanitizeUser(userData), 
      ...tokens 
    });
  // ==========================================
  } catch (err) {
    console.error("Détail de l'erreur login:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// ---------------- LOGOUT ----------------
export async function logoutController(req, res) {
  try {
    const refreshToken = req.body.refreshToken;
    if (refreshToken) await tokenService.revokeRefreshToken(refreshToken);
    return res.json({ success: true, message: "Déconnexion réussie" });
  } catch (err) {
    logger.error("logoutController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// ---------------- REFRESH ----------------
export async function refreshTokenController(req, res) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ success: false, message: "Refresh token manquant" });

    const user = await tokenService.verifyRefreshToken(refreshToken);
    if (!user) return res.status(401).json({ success: false, message: "Refresh token invalide ou expiré" });

    // Révoquer ancien refresh token
    await tokenService.revokeRefreshToken(refreshToken);

    const tokens = await tokenService.generateTokens({ userId: user.id, role: user.role });
    return res.json({ success: true, ...tokens });

  } catch (err) {
    logger.error("refreshTokenController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// ---------------- ME ----------------
export async function meController(req, res) {
  try {
    if (!req.user?.userId) return res.status(401).json({ success: false, message: "Utilisateur non authentifié" });

    const user = await authService.findById(req.user.userId);
    if (!user) return res.status(404).json({ success: false, message: "Utilisateur introuvable" });

    return res.json({ success: true, user: sanitizeUser(user) });

  } catch (err) {
    logger.error("meController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}
// auth.controller.js — remplace l'existant
export async function forgotPasswordController(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: "Email requis" });
    }

    const user = await authService.findByEmail(email);

    // ✅ Anti-fingerprinting — même réponse que l'email existe ou non
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "Si cet email existe, un lien de réinitialisation a été envoyé"
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    await authService.saveResetToken(user.id, token);

    // ✅ Non bloquant — l'utilisateur n'attend pas l'SMTP
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
        message: "Token invalide ou expiré"
      });
    }

    // Mettre à jour le mot de passe
    await authService.updatePassword(record.id, newPassword);

    // Supprimer le token de reset
    await authService.clearResetToken(record.id);

    // Révoquer tous les refresh tokens
    tokenService.revokeAllRefreshTokensForUser(record.id).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "Mot de passe réinitialisé avec succès",
      role: record.role
    });

  } catch (err) {
    logger.error("resetPasswordController error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}