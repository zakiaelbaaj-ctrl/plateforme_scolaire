// =======================================================
// WHITEBOARD ROUTES — API REST
// =======================================================

import express from "express";
import { WhiteboardController } from "../controllers/whiteboard.controller.js";

const router = express.Router();

// -------------------------------------------------------
// Sauvegarder un snapshot
// -------------------------------------------------------
router.post("/snapshot", WhiteboardController.saveSnapshot);

// -------------------------------------------------------
// Récupérer tous les snapshots d'une room
// -------------------------------------------------------
router.get("/snapshots/:roomId", WhiteboardController.getSnapshots);

// -------------------------------------------------------
// Récupérer le dernier snapshot d'une room (optionnel mais utile)
// -------------------------------------------------------
router.get("/snapshot/latest/:roomId", WhiteboardController.getLatestSnapshot);

export default router;
