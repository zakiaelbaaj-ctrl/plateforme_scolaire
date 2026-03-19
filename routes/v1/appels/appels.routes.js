// =======================================================
// Appels Routes – Gestion des appels professeurs/élèves
// =======================================================

import express from "express";
import { requireAuth } from "#middlewares/requireAuth.js";

import {
  listAppels,
  getAppelById,
  createAppel,
  updateAppel,
  deleteAppel,
  endAppel,
  getAppelsEnAttente
} from "#controllers/appel.controller.js";

const router = express.Router();

// --------------------------------------------------
// Liste des appels
// GET /api/v1/appels
// --------------------------------------------------
router.get("/", requireAuth, listAppels);

// --------------------------------------------------
// Appels en attente pour un professeur
// GET /api/v1/appels/professeur/en-attente
// --------------------------------------------------
router.get("/professeur/en-attente", requireAuth, getAppelsEnAttente);

// --------------------------------------------------
// Récupérer un appel par ID
// GET /api/v1/appels/:id
// --------------------------------------------------
router.get("/:id", requireAuth, getAppelById);

// --------------------------------------------------
// Créer un appel
// POST /api/v1/appels
// --------------------------------------------------
router.post("/", requireAuth, createAppel);

// --------------------------------------------------
// Mettre à jour un appel
// PUT /api/v1/appels/:id
// --------------------------------------------------
router.put("/:id", requireAuth, updateAppel);

// --------------------------------------------------
// Supprimer un appel
// DELETE /api/v1/appels/:id
// --------------------------------------------------
router.delete("/:id", requireAuth, deleteAppel);

// --------------------------------------------------
// Terminer un appel
// POST /api/v1/appels/:id/terminer
// --------------------------------------------------
router.post("/:id/terminer", requireAuth, endAppel);

export default router;
