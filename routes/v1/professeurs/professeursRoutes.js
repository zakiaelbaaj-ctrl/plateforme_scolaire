// routes/v1/professeurs/professeurs.routes.js
import express from "express";
import { requireAuth, requireRole } from "../../../middlewares/auth.middleware.js";
import { onlineProfessors } from "../../../ws/state/onlineProfessors.js";

const router = express.Router();

// GET /api/v1/professeurs/online
// ✅ Liste des profs en ligne pour dashboard élève
router.get("/online", requireAuth, requireRole("eleve"), (req, res) => {

  try {
    const profsList = Array.from(onlineProfessors.values()).map(p => ({
      id: p.id,
      name: p.name,        // Nom complet
      status: p.status || "disponible",
      ville: p.ville || "", // Ville
      pays: p.pays || ""    // Pays
    }));

    return res.json({
      success: true,
      profs: profsList
    });
  } catch (err) {
    console.error("❌ Erreur GET /online", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
});


export default router;
