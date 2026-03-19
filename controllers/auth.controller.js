import bcrypt from "bcryptjs";
import logger from "#config/logger.js";
import * as authService from "#services/auth.service.js";
import * as tokenService from "#services/token.service.js";
import * as mailService from "#services/mail.service.js";

// Filtre pour ne jamais exposer mot de passe ou tokens
function sanitizeUser(user) {
  if (!user) return null;
  const { password, resetToken, resetTokenExpires, ...safe } = user;
  return safe;
}

// ---------------- REGISTER ----------------
export async function registerController(req, res) {
  try {
    const { username, prenom, nom, email, telephone, pays, ville, password, role } = req.body;

    if (!email || !password || !prenom || !nom) {
      return res.status(400).json({ success: false, message: "Champs requis manquants" });
    }

    const existing = await authService.findByEmail(email);
    if (existing) return res.status(409).json({ success: false, message: "Un compte existe déjà avec cet email" });

    const hashed = await bcrypt.hash(password, 10);
    const user = await authService.createUser({ username, prenom, nom, email, telephone, pays, ville, password: hashed, role: role || "professeur" });

    const tokens = await tokenService.generateTokens({ userId: user.id, email: user.email, role: user.role });
    mailService.sendWelcomeEmail(user).catch(() => {});

    return res.status(201).json({ success: true, user: sanitizeUser(user), ...tokens });

  } catch (err) {
    logger.error("registerController error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// ---------------- LOGIN ----------------
export async function loginController(req, res) {
  try {
    const { email, username, password } = req.body;

    const user = email ? await authService.findByEmail(email) : await authService.findByUsername(username);
    if (!user) return res.status(401).json({ success: false, message: "Utilisateur ou mot de passe invalide" });

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
