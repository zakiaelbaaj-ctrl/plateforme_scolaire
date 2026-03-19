// routes/v1/admin/users.js
// --------------------------------------------------
// Routes Admin pour gérer les utilisateurs (élèves, profs)
// --------------------------------------------------

import express from "express";
import { pool } from "#config/db.js";
import { requireAuth, requireAdmin } from "#middlewares/auth.middleware.js";

const router = express.Router();

// --------------------------------------------------
// GET /api/v1/admin/users
// Liste tous les utilisateurs selon un rôle
// Exemple : /api/v1/admin/users?role=eleve
// --------------------------------------------------
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.query;

    let query = `
      SELECT 
        id, username, email, prenom, nom, role, statut, matiere, date_inscription
      FROM users
    `;
    const params = [];

    if (role) {
      query += " WHERE role = $1";
      params.push(role);
    }

    const result = await pool.query(query, params);

    return res.status(200).json({
      success: true,
      users: result.rows
    });

  } catch (err) {
    console.error("❌ Erreur GET /admin/users:", err);
    return res.status(500).json({
      success: false,
      error: "Erreur serveur"
    });
  }
});

// --------------------------------------------------
// DELETE /api/v1/admin/users/:id
// Supprime un utilisateur
// --------------------------------------------------
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "DELETE FROM users WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur introuvable"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Utilisateur supprimé",
      id
    });

  } catch (err) {
    console.error("❌ Erreur DELETE /admin/users/:id:", err);
    return res.status(500).json({
      success: false,
      error: "Erreur serveur"
    });
  }
});

// --------------------------------------------------
// PUT /api/v1/admin/users/:id
// Mise à jour du statut ou de la matière (prof)
// --------------------------------------------------
router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { statut, matiere } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET statut = COALESCE($1, statut),
           matiere = COALESCE($2, matiere)
       WHERE id = $3
       RETURNING id, username, role, statut, matiere`,
      [statut, matiere, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        error: "Utilisateur introuvable"
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0]
    });

  } catch (err) {
    console.error("❌ Erreur PUT /admin/users/:id:", err);
    return res.status(500).json({
      success: false,
      error: "Erreur serveur"
    });
  }
});

export default router;
