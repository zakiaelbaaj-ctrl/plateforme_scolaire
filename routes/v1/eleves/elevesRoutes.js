// Fichier : routes/v1/eleves/elevesRoutes.js
import express from "express";
import * as elevesController from "#controllers/eleves.controller.js";
import * as favorisController from "#controllers/favoris.controller.js"; // ✅ NOUVEAU
import { requireAuth, requireRole } from "#middlewares/auth.middleware.js";
const router = express.Router();
router.use(requireAuth);

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

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
router.get("/heures", asyncHandler(elevesController.getElevesWithHeures));
router.get("/me", asyncHandler(elevesController.meEleve));
router.get("/historique/:id", validateIdParam, asyncHandler(elevesController.getHistorique));

// --------------------------------------------------
// ✅ NOUVEAU — FAVORIS (élève connecté)
// Placées AVANT les routes CRUD génériques /:id, pour éviter
// tout conflit de routage entre "/favoris" et le paramètre :id.
// --------------------------------------------------
router.get("/favoris", asyncHandler(favorisController.getMyFavoris));
router.post("/favoris/:profId", asyncHandler(favorisController.addFavori));
router.delete("/favoris/:profId", asyncHandler(favorisController.removeFavori));

// --------------------------------------------------
// ROUTES CRUD ÉLÈVES
// --------------------------------------------------
router.get("/", requireRole("admin"), asyncHandler(elevesController.getAllEleves));
router.get("/:id", validateIdParam, requireRole("admin"), asyncHandler(elevesController.getEleveById));
router.post("/", requireRole("admin"), express.json(), asyncHandler(elevesController.createEleve));
router.put("/:id", validateIdParam, requireRole("admin"), express.json(), asyncHandler(elevesController.updateEleve));
router.delete("/:id", validateIdParam, requireRole("admin"), asyncHandler(elevesController.deleteEleve));

export default router;