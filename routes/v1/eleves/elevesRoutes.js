// Fichier : routes/v1/eleves/elevesRoutes.js
// --------------------------------------------------
// Routes élèves – sécurisées, modernes et maintenables
// --------------------------------------------------

import express from "express";
import * as elevesController from "#controllers/eleves.controller.js";
// 1. Importe ton middleware de sécurité
import { requireAuth, requireRole } from "#middlewares/auth.middleware.js";
const router = express.Router();
router.use(requireAuth); // Applique l'authentification à toutes les routes de ce router

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
 * Liste des élèves : Généralement réservé aux profs/admins
 */
router.get(
  "/",
  requireRole("admin"), // Seul l'admin voit la liste globale
  asyncHandler(elevesController.getAllEleves)
);

/**
 * GET /api/v1/eleves/:id
 */
router.get(
  "/:id",
  validateIdParam,
  requireRole("admin"),
  asyncHandler(elevesController.getEleveById)
);

/**
 * POST /api/v1/eleves
 * Créer un élève : SEULS les profs/admins
 */
router.post(
  "/",
  requireRole("admin"),
  express.json(),
  asyncHandler(elevesController.createEleve)
);

/**
 * PUT /api/v1/eleves/:id
 * Mettre à jour : SEULS les profs/admins
 */
router.put(
  "/:id",
  validateIdParam,
  requireRole("admin"),
  express.json(),
  asyncHandler(elevesController.updateEleve)
);

/**
 * DELETE /api/v1/eleves/:id
 * Supprimer : SEULS les profs/admins
 */
router.delete(
  "/:id",
  validateIdParam,
  requireRole("admin"),
  asyncHandler(elevesController.deleteEleve)
);

export default router;
