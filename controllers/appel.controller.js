// controllers/appel.controller.js
// --------------------------------------------------
// Appel controllers – senior+++, sécurisé et maintenable
// Responsibility: HTTP layer only (req/res)
// --------------------------------------------------

import logger from "#config/logger.js";
import { sequelize } from "#config/index.js";
import * as appelService from "#services/appels.services.js";

/**
 * Retire les champs sensibles / internes avant de renvoyer l'objet appel
 * @param {object} appel
 * @returns {object|null}
 */
function sanitizeAppel(appel) {
  if (!appel) return null;
  const { internalMeta, secret, ...safe } = appel;
  return safe;
}

/**
 * GET /api/appels
 * Query params: ?q=search&limit&offset&status
 * Retourne une liste paginée / filtrée d'appels
 */
export async function listAppels(req, res) {
  try {
    const q = req.query.q || null;
    const status = req.query.status || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const { rows, count } = await appelService.findAll({ q, status, limit, offset });

    const safe = rows.map(sanitizeAppel);
    return res.status(200).json({ ok: true, data: safe, meta: { count, limit, offset } });
  } catch (err) {
    logger.error("listAppels error:", err);
    return res.status(500).json({
      ok: false,
      message: process.env.NODE_ENV === "production" ? "Erreur serveur" : err?.message || "Erreur interne"
    });
  }
}

/**
 * GET /api/appels/:id
 * Récupère un appel par id
 */
export async function getAppelById(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Identifiant requis" });

    const appel = await appelService.findById(id);
    if (!appel) return res.status(404).json({ ok: false, message: "Appel non trouvé" });

    return res.status(200).json({ ok: true, data: sanitizeAppel(appel) });
  } catch (err) {
    logger.error("getAppelById error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * POST /api/appels
 * Body: { initiateurId, participants: [...], sujet?, metadata? }
 * Crée un nouvel appel (transactionnel si besoin)
 */
export async function createAppel(req, res) {
  const t = await sequelize.transaction();
  try {
    const payload = req.body || {};
    const { initiateurId, participants } = payload;

    if (!initiateurId || !Array.isArray(participants) || participants.length === 0) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "initiateurId et participants requis" });
    }

    const appel = await appelService.createAppel(payload, { transaction: t });
    await t.commit();

    logger.info("Appel créé", { id: appel.id, initiateurId });
    return res.status(201).json({ ok: true, data: sanitizeAppel(appel) });
  } catch (err) {
    await t.rollback();
    logger.error("createAppel error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * PUT /api/appels/:id
 * Body: champs modifiables (ex: statut, sujet)
 * Utilise transaction si plusieurs opérations sont nécessaires
 */
export async function updateAppel(req, res) {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const payload = req.body || {};

    if (!id) {
      await t.rollback();
      return res.status(400).json({ ok: false, message: "Identifiant requis" });
    }

    const updated = await appelService.updateAppel(id, payload, { transaction: t });
    if (!updated) {
      await t.rollback();
      return res.status(404).json({ ok: false, message: "Appel non trouvé" });
    }

    await t.commit();
    logger.info("Appel mis à jour", { id });
    return res.status(200).json({ ok: true, message: "Appel mis à jour" });
  } catch (err) {
    await t.rollback();
    logger.error("updateAppel error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * DELETE /api/appels/:id
 * Supprime un appel (soft-delete recommandé dans service)
 */
export async function deleteAppel(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Identifiant requis" });

    const deleted = await appelService.deleteById(id);
    if (!deleted) return res.status(404).json({ ok: false, message: "Appel non trouvé" });

    logger.info("Appel supprimé", { id });
    return res.status(200).json({ ok: true, message: "Appel supprimé" });
  } catch (err) {
    logger.error("deleteAppel error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}

/**
 * POST /api/appels/:id/end
 * Marque un appel comme terminé (idempotent)
 */
export async function endAppel(req, res) {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ ok: false, message: "Identifiant requis" });

    const result = await appelService.endAppel(id);
    if (!result) return res.status(404).json({ ok: false, message: "Appel non trouvé ou déjà terminé" });

    logger.info("Appel terminé", { id });
    return res.status(200).json({ ok: true, message: "Appel terminé" });
  } catch (err) {
    logger.error("endAppel error:", err);
    return res.status(500).json({ ok: false, message: "Erreur serveur" });
  }
}
/**
 * GET /api/v1/appels/professeur/en-attente
 * Retourne les appels en attente pour un professeur
 */
export async function getAppelsEnAttente(req, res) {
  try {
    const profUsername = req.user?.username; // ← important !

    if (!profUsername) {
      return res.status(401).json({
        ok: false,
        message: "Non authentifié"
      });
    }

    const appels = await appelService.getAppelsEnAttente(profUsername);

    return res.status(200).json({
      ok: true,
      data: appels.map(sanitizeAppel)
    });

  } catch (err) {
    logger.error("getAppelsEnAttente error:", err);
    return res.status(500).json({
      ok: false,
      message: "Erreur serveur"
    });
  }
}
