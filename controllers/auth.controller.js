import bcrypt from "bcryptjs";
import crypto from "crypto";
import Stripe from "stripe";
// Imports de tes configurations et services (via alias #)
import logger from "#config/logger.js";
import * as authService from "#services/auth.service.js";
import * as tokenService from "#services/token.service.js";
import * as mailService from "#services/mail.service.js"; // Gardé une seule fois ici

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

// ---------------- REGISTER ----------------
export async function registerController(req, res) {
  try {
    const { username, prenom, nom, email, telephone, pays, ville, password, role } = req.body;

    // 1. Validation des champs
    if (!email || !password || !prenom || !nom) {
      return res.status(400).json({ success: false, message: "Champs requis manquants" });
    }

    // 2. Vérification base de données (AVANT Stripe)
    const existing = await authService.findByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: "Un compte existe déjà avec cet email" });
    }

    const hashed = await bcrypt.hash(password, 10);

    // 3. --- LOGIQUE STRIPE (Élève vs Prof) ---
    let stripe_customer_id = null;
    let stripe_account_id = null;

    try {
      if (role === "prof") {
        // Création du compte Connect pour le prof (pour recevoir l'argent)
        const account = await stripe.accounts.create({
          type: 'express',
          email: email,
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        stripe_account_id = account.id;
      } else {
        // Création du compte Customer pour l'élève (pour payer)
        const customer = await stripe.customers.create({
          email,
          name: `${prenom} ${nom}`,
          metadata: { username: username || "non_defini" },
        });
        stripe_customer_id = customer.id;
      }
    } catch (stripeErr) {
      logger.error("Erreur Stripe lors de l'inscription:", stripeErr);
      return res.status(500).json({ success: false, message: "Erreur lors de l'initialisation du compte de paiement" });
    }

    // 4. Création de l'utilisateur avec tous les nouveaux champs
    const user = await authService.createUser({
      username,
      prenom,
      nom,
      email,
      telephone,
      pays,
      ville,
      password: hashed,
      role: role || "eleve",
      stripe_customer_id,
      stripe_account_id,
      is_active: role !== "prof" // true pour élève, false pour prof (attente admin)
    });

    // 5. Génération des tokens et email
    const tokens = await tokenService.generateTokens({ userId: user.id, email: user.email, role: user.role });
    
    // On n'attend pas l'envoi de l'email pour répondre au client
    mailService.sendWelcomeEmail(user).catch(() => {});

    return res.status(201).json({ 
      success: true, 
      message: role === "prof" ? "Inscription réussie, en attente de validation admin." : "Inscription réussie",
      user: sanitizeUser(user), 
      ...tokens 
    });

  } catch (err) {
    logger.error("registerController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}
// ---------------- LOGIN ----------------
export async function loginController(req, res) {
  try {
    const { email, username, password } = req.body;

    const user = email 
  ? await authService.findByEmailWithPassword(email) 
  : await authService.findByUsernameWithPassword(username);
    if (!user) return res.status(401).json({ success: false, message: "Utilisateur ou mot de passe invalide" });
    if (!user.is_active && (user.role === "prof" || user.role === "professeur")) {
    return res.status(403).json({ 
    success: false, 
    message: "Votre compte est en attente de validation par l'administrateur." 
  });
}

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: "Utilisateur ou mot de passe invalide" });

    const tokens = await tokenService.generateTokens({ userId: user.id, email: user.email, role: user.role });
    return res.json({ success: true, user: sanitizeUser(user), ...tokens });

  } catch (err) {
    logger.error("loginController error:", err);
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

    const tokens = await tokenService.generateTokens({ userId: user.id, email: user.email, role: user.role });
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
export async function forgotPasswordController(req, res) {
  try {
    const { email } = req.body;

    // 1. Validation simple
    if (!email) {
      return res.status(400).json({ success: false, message: "Email requis" });
    }

    // 2. Recherche de l'utilisateur
    const user = await authService.findByEmail(email);
    if (!user) {
      return res.status(404).json({ success: false, message: "Email introuvable" });
    }

    // 3. Génération et sauvegarde du token
    const token = crypto.randomBytes(32).toString("hex");
    await authService.saveResetToken(user.id, token);

    // 4. Envoi de l'email avec gestion d'erreur SMTP
    // Note : On a supprimé l'appel en doublon qui était ici
    try {
      await mailService.sendResetPasswordEmail(user, token);
    } catch (mailErr) {
      logger.error("Erreur SMTP lors du reset password:", mailErr.message);
      return res.status(503).json({ 
        success: false, 
        message: "Le service d'envoi d'emails est temporairement indisponible." 
      });
    }

    return res.json({ success: true, message: "Email de réinitialisation envoyé" });

  } catch (err) {
    logger.error("forgotPasswordController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
} 
