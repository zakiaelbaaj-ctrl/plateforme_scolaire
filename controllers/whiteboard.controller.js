// =======================================================
// WHITEBOARD CONTROLLER — Logique métier
// =======================================================

import { WhiteboardModel } from "../models/whiteboard.model.js";

export const WhiteboardController = {

  // -----------------------------------------------------
  // Sauvegarder un snapshot
  // -----------------------------------------------------
  async saveSnapshot(req, res) {
    try {
      const { roomId, snapshot } = req.body;

      if (!roomId || !snapshot) {
        return res.status(400).json({ error: "roomId et snapshot requis" });
      }

      const saved = await WhiteboardModel.saveSnapshot(roomId, snapshot);

      return res.json({
        success: true,
        snapshot: saved
      });

    } catch (err) {
      console.error("❌ Erreur saveSnapshot:", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // -----------------------------------------------------
  // Récupérer tous les snapshots d'une room
  // -----------------------------------------------------
  async getSnapshots(req, res) {
    try {
      const { roomId } = req.params;

      if (!roomId) {
        return res.status(400).json({ error: "roomId requis" });
      }

      const snapshots = await WhiteboardModel.getSnapshots(roomId);

      return res.json({ snapshots });

    } catch (err) {
      console.error("❌ Erreur getSnapshots:", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // -----------------------------------------------------
  // Récupérer le dernier snapshot d'une room
  // -----------------------------------------------------
  async getLatestSnapshot(req, res) {
    try {
      const { roomId } = req.params;

      if (!roomId) {
        return res.status(400).json({ error: "roomId requis" });
      }

      const latest = await WhiteboardModel.getLatestSnapshot(roomId);

      return res.json({ snapshot: latest || null });

    } catch (err) {
      console.error("❌ Erreur getLatestSnapshot:", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }
};
