// Fichier : routes/v1/eleves/elevesRoutes.js
// --------------------------------------------------
// Routes élèves – sécurisées, modernes et maintenables
// --------------------------------------------------

import express from "express";
import * as elevesController from "#controllers/eleves.controller.js";

const router = express.Router();

/**
 * Middleware pour capturer les erreurs async
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Middleware de validation pour paramètre ID
 */
const validateIdParam = (req, res, next) => {
  const { id } = req.params;
  if (!id || !/^\d+$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: "Paramètre 'id' invalide (doit être un entier positif).",
    });
  }
  next();
};

// --------------------------------------------------
// ROUTES SPÉCIALES (avant les routes dynamiques)
// --------------------------------------------------

/**
 * GET /api/v1/eleves/heures
 * Liste des élèves avec leurs heures du mois courant
 */
router.get(
  "/heures",
  asyncHandler(elevesController.getElevesWithHeures)
);

/**
 * GET /api/v1/eleves/me
 * Récupérer les infos de l'élève connecté
 */
router.get(
  "/me",
  asyncHandler(elevesController.meEleve)
);

/**
 * GET /api/v1/eleves/historique/:id
 * Historique journalier d’un élève
 */
router.get(
  "/historique/:id",
  validateIdParam,
  asyncHandler(elevesController.getHistorique)
);

// --------------------------------------------------
// ROUTES CRUD ÉLÈVES
// --------------------------------------------------

/**
 * GET /api/v1/eleves
 * Liste paginée / filtrée des élèves
 */
router.get(
  "/",
  asyncHandler(elevesController.getAllEleves)
);

/**
 * GET /api/v1/eleves/:id
 * Récupérer un élève par ID
 */
router.get(
  "/:id",
  validateIdParam,
  asyncHandler(elevesController.getEleveById)
);

/**
 * POST /api/v1/eleves
 * Créer un élève
 */
router.post(
  "/",
  express.json(),
  asyncHandler(elevesController.createEleve)
);

/**
 * PUT /api/v1/eleves/:id
 * Mettre à jour un élève
 */
router.put(
  "/:id",
  validateIdParam,
  express.json(),
  asyncHandler(elevesController.updateEleve)
);

/**
 * DELETE /api/v1/eleves/:id
 * Supprimer un élève
 */
router.delete(
  "/:id",
  validateIdParam,
  asyncHandler(elevesController.deleteEleve)
);

export default router;
