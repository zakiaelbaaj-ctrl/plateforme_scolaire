// controllers/prof.controller.js
// --------------------------------------------------
// Controller moderne pour la gestion des professeurs
// --------------------------------------------------

import * as profService from "#services/prof.service.js";
import logger from "#config/logger.js";

/**
 * GET /api/professeurs
 * Liste paginée / filtrée des professeurs
 */
export async function getAllProfs(req, res) {
  try {
    const { q, limit, offset } = req.query;

    const data = await profService.findAll({
      q: q || null,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });

    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (err) {
    logger.error("❌ getAllProfs failed", { message: err.message });
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

/**
 * GET /api/professeurs/:id
 * Récupérer un professeur par ID
 */
export async function getProfById(req, res) {
  try {
    const { id } = req.params;

    const prof = await profService.findById(id);

    if (!prof) {
      return res.status(404).json({
        success: false,
        message: "Professeur introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      data: prof,
    });
  } catch (err) {
    logger.error("❌ getProfById failed", { message: err.message });
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

/**
 * PUT /api/professeurs/:id
 * Mettre à jour un professeur
 */
export async function updateProf(req, res) {
  try {
    const { id } = req.params;
    const data = req.body;

    const updated = await profService.updateProf(id, data);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Professeur introuvable ou non modifié",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Professeur mis à jour avec succès",
      data: updated,
    });
  } catch (err) {
    logger.error("❌ updateProf failed", { message: err.message });
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

/**
 * DELETE /api/professeurs/:id
 * Supprimer un professeur
 */
export async function deleteProf(req, res) {
  try {
    const { id } = req.params;

    const deleted = await profService.deleteById(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Professeur introuvable",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Professeur supprimé avec succès",
    });
  } catch (err) {
    logger.error("❌ deleteProf failed", { message: err.message });
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

/**
 * GET /api/professeurs/heures
 * Liste des professeurs avec leurs heures du mois
 */
export async function getProfsWithHeures(req, res) {
  try {
    const { q, limit, offset } = req.query;

    const rows = await profService.findAllWithHeures({
      q: q || null,
      limit: limit ? Number(limit) : 5000,
      offset: offset ? Number(offset) : 0,
    });

    return res.status(200).json({
      success: true,
      rows,
    });
  } catch (err) {
    logger.error("❌ getProfsWithHeures failed", { message: err.message });
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}
