// --------------------------------------------------
// Routes élèves – Liste avec heures du mois courant
// --------------------------------------------------

import express from "express";
import * as elevesController from "../../../controllers/eleves.controller.js";

const router = express.Router();

/**
 * Middleware utilitaire pour capturer les erreurs async
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// --------------------------------------------------
// Route spécifique : GET /api/v1/eleves/avec_heures
// --------------------------------------------------
/**
 * Renvoie tous les élèves avec leurs heures du mois courant
 */
router.get(
  "/",
  asyncHandler(elevesController.getElevesAvecHeures)
);

export default router;
