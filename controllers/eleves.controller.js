// controllers/eleves.controller.js
// --------------------------------------------------
// Controller moderne pour la gestion des élèves
// --------------------------------------------------

import logger from "#config/logger.js";
import { sequelize } from "#config/index.js";
import * as elevesService from "#services/elevesService.js";

/**
 * Retire les champs sensibles avant de renvoyer l'objet élève
 */
function sanitizeEleve(eleve) {
  if (!eleve) return null;
  const { password, resetToken, resetTokenExpires, ssn, ...safe } = eleve;
  return safe;
}

// --------------------------------------------------
// LISTE DES ÉLÈVES
// --------------------------------------------------

/**
 * GET /api/v1/eleves
 * Liste paginée / filtrée des élèves
 */
export async function getAllEleves(req, res) {
  try {
    const q = req.query.q || null;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const { rows, count } = await elevesService.findAll({ q, limit, offset });
    const safe = rows.map(sanitizeEleve);

    return res.status(200).json({
      success: true,
      data: safe,
      meta: { count, limit, offset }
    });
  } catch (err) {
    logger.error("getAllEleves error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}

// --------------------------------------------------
// DÉTAIL D’UN ÉLÈVE
// --------------------------------------------------

/**
 * GET /api/v1/eleves/:id
 */
export async function getEleveById(req, res) {
  try {
    const id = req.params.id;

    const eleve = await elevesService.findById(id);
    if (!eleve) {
      return res.status(404).json({
        success: false,
        message: "Élève non trouvé"
      });
    }

    return res.status(200).json({
      success: true,
      data: sanitizeEleve(eleve)
    });
  } catch (err) {
    logger.error("getEleveById error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// HISTORIQUE JOURNALIER
// --------------------------------------------------

/**
 * GET /api/v1/eleves/historique/:id
 */
export async function getHistorique(req, res) {
  try {
    const { id } = req.params;

    const historique = await elevesService.findHistoriqueById(id);

    return res.status(200).json({
      success: true,
      data: historique || []
    });
  } catch (err) {
    logger.error("getHistorique error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// CRÉATION D’UN ÉLÈVE
// --------------------------------------------------

/**
 * POST /api/v1/eleves
 */
export async function createEleve(req, res) {
  try {
    const payload = req.body || {};

    if (!payload.email || !payload.prenom || !payload.nom) {
      return res.status(400).json({
        success: false,
        message: "prenom, nom et email requis"
      });
    }

    const eleve = await elevesService.createEleve(payload);

    return res.status(201).json({
      success: true,
      data: sanitizeEleve(eleve)
    });
  } catch (err) {
    logger.error("createEleve error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}

// --------------------------------------------------
// MISE À JOUR D’UN ÉLÈVE
// --------------------------------------------------

/**
 * PUT /api/v1/eleves/:id
 */
export async function updateEleve(req, res) {
  const t = await sequelize.transaction();
  try {
    const id = req.params.id;
    const payload = req.body || {};

    const updated = await elevesService.updateUser(id, payload, { transaction: t });

    if (!updated) {
      await t.rollback();
      return res.status(404).json({
        success: false,
        message: "Élève non trouvé"
      });
    }

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "Élève mis à jour"
    });
  } catch (err) {
    await t.rollback();
    logger.error("updateEleve error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// SUPPRESSION D’UN ÉLÈVE
// --------------------------------------------------

/**
 * DELETE /api/v1/eleves/:id
 */
export async function deleteEleve(req, res) {
  try {
    const id = req.params.id;

    const deleted = await elevesService.deleteById(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Élève non trouvé"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Élève supprimé"
    });
  } catch (err) {
    logger.error("deleteEleve error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// PROFIL DE L’ÉLÈVE CONNECTÉ
// --------------------------------------------------

/**
 * GET /api/v1/eleves/me
 */
export async function meEleve(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Non authentifié"
      });
    }

    const eleve = await elevesService.findById(req.user.id);

    return res.status(200).json({
      success: true,
      data: sanitizeEleve(eleve || req.user)
    });
  } catch (err) {
    logger.error("meEleve error:", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// ÉLÈVES AVEC HEURES DU MOIS
// --------------------------------------------------

/**
 * GET /api/v1/eleves/heures
 */
export async function getElevesWithHeures(req, res) {
  try {
    const rows = await elevesService.findAllWithHeures({
      q: req.query.q || null,
      limit: 5000,
      offset: 0
    });

    const safe = rows.map(sanitizeEleve);

    return res.status(200).json({
      success: true,
      data: safe
    });
  } catch (err) {
    logger.error("getElevesWithHeures error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors du chargement des élèves avec heures"
    });
  }
}
