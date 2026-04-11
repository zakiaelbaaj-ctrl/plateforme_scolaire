// controllers/user.controller.js
// --------------------------------------------------
// User controllers – senior+++, sécurisé et maintenable
// Responsibility: HTTP layer only (req/res)
// --------------------------------------------------

import logger from "#config/logger.js";
import { sequelize } from "#config/index.js";
import * as userService from "#services/user.service.js";
import * as tokenService from "#services/token.service.js";
import Stripe from "stripe"; 
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
/**
 * Retire les champs sensibles avant de renvoyer l'objet user
 * @param {object} user
 * @returns {object|null}
 */
function sanitizeUser(user) {
  if (!user) return null;
  const { password, resetToken, resetTokenExpires, refreshTokens, ...safe } = user;
  return safe;
}

/**
 * GET /api/users
 * Query params: ?q=search&limit&offset&role
 * Retourne une liste paginée / filtrée d'utilisateurs
 */
export async function listUsers(req, res) {
  try {
    const q = req.query.q || null;
    const role = req.query.role || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const { rows, count } = await userService.findAll({ q, role, limit, offset });

    const safe = rows.map(sanitizeUser);
    return res.status(200).json({ ok: true, data: safe, meta: { count, limit, offset } });
  } catch (err) {
    logger.error("listUsers error:", err);
    return res.status(500).json({
      ok: false,
      message: process.env.NODE_ENV === "production" ? "Erreur serveur" : err?.message || "Erreur interne"
    });
  }
}

/**
 * GET /api/users/:id
 * Récupère un utilisateur par id
 */
export async function getUserById(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Identifiant requis" });

    const user = await userService.findById(id);
    if (!user) return res.status(404).json({ ok: false, message: "Utilisateur non trouvé" });

    return res.status(200).json({ ok: true, data: sanitizeUser(user) });
  } catch (err) {
    logger.error("getUserById error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * POST /api/users
 * Body: { email, prenom, nom, role?, password? }
 * Crée un nouvel utilisateur. Le service gère hash/password et validations.
 */
export async function createUser(req, res) {
  const t = await sequelize.transaction();
  try {
    const payload = req.body || {};
    if (!payload.email || !payload.prenom || !payload.nom) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "prenom, nom et email requis" });
    }

    const user = await userService.createUser(payload, { transaction: t });
    await t.commit();

    logger.info("Nouvel utilisateur créé", { id: user.id, email: user.email });
    return res.status(201).json({ ok: true, data: sanitizeUser(user) });
  } catch (err) {
    await t.rollback();
    logger.error("createUser error:", err);
    const status = err?.statusCode || 500;
    const message = process.env.NODE_ENV === "production" ? "Erreur serveur" : err?.message || "Erreur interne";
    return res.status(status).json({ ok: false, message });
  }
}

/**
 * PUT /api/users/:id
 * Body: champs modifiables (prenom, nom, email, role, actif)
 * Utilise transaction si plusieurs opérations sont nécessaires
 */
export async function updateUser(req, res) {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const payload = req.body || {};

    if (!id) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "Identifiant requis" });
    }

    // Empêcher modification de champs sensibles côté controller
    delete payload.password;
    delete payload.refreshTokens;

    const updated = await userService.updateUser(id, payload, { transaction: t });
    if (!updated) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Utilisateur non trouvé" });
    }

    await t.commit();
    logger.info("Utilisateur mis à jour", { id });
    return res.status(200).json({ ok: true, message: "Utilisateur mis à jour" });
  } catch (err) {
    await t.rollback();
    logger.error("updateUser error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * DELETE /api/users/:id
 * Supprime un utilisateur. Le service doit préférer soft-delete et gérer contraintes.
 * Révoque également les refresh tokens associés.
 */
export async function deleteUser(req, res) {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    if (!id) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "Identifiant requis" });
    }

    const deleted = await userService.deleteById(id, { transaction: t });
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Utilisateur non trouvé" });
    }

    // Révoquer les refresh tokens (non bloquant si échoue)
    tokenService.revokeAllRefreshTokensForUser(id).catch(err => {
      logger.warn("Failed to revoke refresh tokens for user", { id, err: err?.message || err });
    });

    await t.commit();
    logger.info("Utilisateur supprimé", { id });
    return res.status(200).json({ ok: true, message: "Utilisateur supprimé" });
  } catch (err) {
    await t.rollback();
    logger.error("deleteUser error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * POST /api/users/:id/change-password
 * Body: { currentPassword?, newPassword }
 * Si currentPassword fourni, vérifie avant de changer (self-service).
 * Admins peuvent changer sans currentPassword.
 */
export async function changePassword(req, res) {
  try {
    const id = req.params.id;
    const { currentPassword, newPassword } = req.body;

    if (!id || !newPassword) return res.status(400).json({ ok: false, message: "id et newPassword requis" });

    const actor = req.user; // middleware auth peut attacher req.user
    const isAdmin = actor?.role === "admin";

    // Si l'appelant n'est pas admin, il doit changer son propre mot de passe et fournir currentPassword
    if (!isAdmin) {
      if (!actor || String(actor.id) !== String(id)) {
        return res.status(403).json({ ok: false, message: "Non autorisé" });
      }
      if (!currentPassword) return res.status(400).json({ ok: false, message: "currentPassword requis" });
    }

    const result = await userService.changePassword(id, { currentPassword, newPassword, isAdmin });
    if (!result) return res.status(400).json({ ok: false, message: "Impossible de changer le mot de passe" });

    // Révoquer les refresh tokens après changement de mot de passe
    tokenService.revokeAllRefreshTokensForUser(id).catch(() => {});

    logger.info("Mot de passe changé", { id, by: actor?.id || "system" });
    return res.status(200).json({ ok: true, message: "Mot de passe mis à jour" });
  } catch (err) {
    logger.error("changePassword error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * GET /api/users/me
 * Retourne le profil de l'utilisateur authentifié (req.user fourni par middleware)
 */
export async function meUser(req, res) {
  try {
    if (!req.user) return res.status(401).json({ ok: false, message: "Non authentifié" });

    const user = await userService.findById(req.user.id);
    if (!user) return res.status(404).json({ ok: false, message: "Utilisateur introuvable" });

    // ✅ AJOUT SÉCURITÉ : Empêcher l'accès au profil si le prof n'est pas "active"
    if ((user.role === "prof" || user.role === "professeur") && 
        (!user.statut || user.statut.toLowerCase().trim() !== "active")) {
        return res.status(403).json({ ok: false, message: "Compte non actif" });
    }

    return res.status(200).json({ ok: true, data: sanitizeUser(user) });
  } catch (err) {
    logger.error("meUser error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * PATCH /api/users/:id/role
 * Body: { role }
 * Change le rôle d'un utilisateur (admin only). Validation côté controller.
 */
export async function setRole(req, res) {
  const t = await sequelize.transaction();
  try {
    const actor = req.user;
    if (!actor || actor.role !== "admin") {
      await t.rollback();
      return res.status(403).json({ ok: false, message: "Non autorisé" });
    }

    const id = req.params.id;
    const { role } = req.body;
    const allowedRoles = ["user", "prof", "eleve", "admin"];
    if (!id || !role) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "id et role requis" });
    }
    if (!allowedRoles.includes(role)) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "role invalide" });
    }

    const updated = await userService.updateUser(id, { role }, { transaction: t });
    if (!updated) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Utilisateur non trouvé" });
    }

    await t.commit();
    logger.info("Role modifié", { id, role, by: actor.id });
    return res.status(200).json({ ok: true, message: "Role mis à jour" });
  } catch (err) {
    await t.rollback();
    logger.error("setRole error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}
/**
 * PATCH /api/users/:id/validate-prof
 * Valide un professeur (admin only) et génère son lien d'onboarding Stripe Connect.
 */
export async function validateAndOnboardProfessor(req, res) {
  const t = await sequelize.transaction();
  try {
    const actor = req.user;
    const { id } = req.params;

    // 1. Vérification des permissions Admin
    if (!actor || actor.role !== "admin") {
      await t.rollback();
      return res.status(403).json({ ok: false, message: "Non autorisé" });
    }

    // 2. Récupérer l'utilisateur
    const user = await userService.findById(id);
    // ✅ Correction : Accepter "prof" ou "professeur"
    if (!user || (user.role !== "professeur" && user.role !== "prof")) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Professeur introuvable" });
    }

    // 3. Activer le compte
    // ✅ Correction : On met à jour is_active ET statut
    const updated = await userService.updateUser(id, { 
        is_active: true, 
        statut: "active" 
    }, { transaction: t });
    if (!updated) {
      await t.rollback();
      return res.status(500).json({ ok: false, message: "Erreur lors de l'activation en base" });
    }

    // 4. Générer le lien Stripe Connect Onboarding
    // Note: Assurez-vous que l'URL de votre site est correcte dans les variables d'env
    const accountLink = await stripe.accountLinks.create({
      account: user.stripe_account_id,
      refresh_url: `${process.env.FRONTEND_URL}/onboarding-retry?userId=${id}`,
      return_url: `${process.env.FRONTEND_URL}/onboarding-success`,
      type: 'account_onboarding',
    });

    await t.commit();
    
    logger.info("Professeur validé et lien Stripe généré", { id, adminId: actor.id });

    return res.status(200).json({ 
      ok: true, 
      message: "Professeur validé avec succès",
      data: {
        onboardingUrl: accountLink.url // L'admin peut envoyer ce lien au prof ou le prof le verra à sa prochaine connexion
      }
    });

  } catch (err) {
    if (t) await t.rollback();
    logger.error("validateAndOnboardProfessor error:", err);
    return res.status(500).json({ ok: false, message: "Erreur lors de la validation Stripe" });
  }
}