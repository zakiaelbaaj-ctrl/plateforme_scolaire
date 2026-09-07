// controllers/favoris.controller.js
// --------------------------------------------------
// Gestion des professeurs favoris d'un élève
// --------------------------------------------------
import logger from "#config/logger.js";
import * as favorisService from "#services/favoris.service.js";

/**
 * GET /api/v1/eleves/favoris
 * Liste des IDs de profs favoris de l'élève connecté
 */
export async function getMyFavoris(req, res) {
  try {
    const eleveId = req.user.userId; // ✅ confirmé — auth.middleware.js pose userId, pas id

    const profIds = await favorisService.getFavorisByEleve(eleveId);

    return res.status(200).json({
      success: true,
      data: profIds
    });
  } catch (err) {
    logger.error("getMyFavoris error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}

/**
 * POST /api/v1/eleves/favoris/:profId
 * Ajouter un professeur aux favoris de l'élève connecté
 */
export async function addFavori(req, res) {
  try {
    const eleveId = req.user.userId;
    const profId = parseInt(req.params.profId, 10);

    if (isNaN(profId)) {
      return res.status(400).json({
        success: false,
        message: "ID professeur invalide"
      });
    }

    await favorisService.addFavori(eleveId, profId);

    return res.status(200).json({
      success: true,
      message: "Ajouté aux favoris"
    });
  } catch (err) {
    logger.error("addFavori error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}

/**
 * DELETE /api/v1/eleves/favoris/:profId
 * Retirer un professeur des favoris de l'élève connecté
 */
export async function removeFavori(req, res) {
  try {
    const eleveId = req.user.userId;
    const profId = parseInt(req.params.profId, 10);

    if (isNaN(profId)) {
      return res.status(400).json({
        success: false,
        message: "ID professeur invalide"
      });
    }

    await favorisService.removeFavori(eleveId, profId);

    return res.status(200).json({
      success: true,
      message: "Retiré des favoris"
    });
  } catch (err) {
    logger.error("removeFavori error:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}