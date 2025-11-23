import express from "express";
import { pool } from "../server.js";

const router = express.Router();

// ===== GET TOUS LES PROFESSEURS AVEC HEURES =====
router.get("/professeurs/avec_heures", async (req, res) => {
  try {
    const query = `
      SELECT 
        u.id,
        u.prenom,
        u.nom,
        u.username,
        u.email,
        u.statut,
        u.role,
        u.matiere,
        COALESCE(SUM(a.duree_minutes)/60, 0) AS heures_en_ligne
      FROM users u
      LEFT JOIN appels a 
        ON u.username = a.prof_username
        AND a.statut = 'termine'
        AND DATE_TRUNC('month', a.start_time) = DATE_TRUNC('month', CURRENT_DATE)
      WHERE u.role = 'prof'
      GROUP BY u.id, u.prenom, u.nom, u.username, u.email, u.statut, u.role, u.matiere
      ORDER BY u.nom, u.prenom
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur GET professeurs:", err.message);
    res.status(500).json({ error: "Impossible de récupérer les professeurs" });
  }
});

// ===== GET PROFESSEURS PAR MATIERE =====
router.get("/professeurs/matiere/:matiere", async (req, res) => {
  const { matiere } = req.params;

  try {
    const result = await pool.query(`
      SELECT id, prenom, nom, email, username, matiere, statut
      FROM users
      WHERE LOWER(matiere) LIKE LOWER($1)
      AND statut = 'valide'
      AND role = 'prof'
      ORDER BY nom
    `, [`%${matiere}%`]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "Aucun professeur disponible pour cette matière" 
      });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur GET professeurs par matière:", err.message);
    res.status(500).json({ error: "Impossible de récupérer les professeurs" });
  }
});

// ===== GET TOUTES LES MATIERES DISPONIBLES =====
router.get("/matieres", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT matiere
      FROM users
      WHERE matiere IS NOT NULL
      AND statut = 'valide'
      AND role = 'prof'
      ORDER BY matiere
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur GET matières:", err.message);
    res.status(500).json({ error: "Impossible de récupérer les matières" });
  }
});

// ===== PUT MODIFIER STATUT D'UN PROFESSEUR =====
router.put("/professeurs/:id", async (req, res) => {
  const { id } = req.params;
  const { statut } = req.body;

  if (!statut) {
    return res.status(400).json({ error: "Statut requis" });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET statut = $1 WHERE id = $2 AND role = 'prof' RETURNING *",
      [statut, id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Professeur non trouvé" });
    }

    res.json({ message: "Statut mis à jour avec succès", prof: result.rows[0] });
  } catch (err) {
    console.error("❌ Erreur PUT professeur:", err.message);
    res.status(500).json({ error: "Impossible de mettre à jour le professeur" });
  }
});

// ===== PUT MODIFIER MATIERE D'UN PROFESSEUR =====
router.put("/professeurs/:id/matiere", async (req, res) => {
  const { id } = req.params;
  const { matiere } = req.body;

  if (!matiere) {
    return res.status(400).json({ error: "Matière requise" });
  }

  try {
    const result = await pool.query(
      "UPDATE users SET matiere = $1 WHERE id = $2 AND role = 'prof' RETURNING id, nom, prenom, matiere",
      [matiere, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Professeur non trouvé" });
    }

    res.json({ 
      message: "Matière mise à jour avec succès",
      prof: result.rows[0] 
    });
  } catch (err) {
    console.error("❌ Erreur PUT matière:", err.message);
    res.status(500).json({ error: "Impossible de mettre à jour la matière" });
  }
});

// ===== DELETE SUPPRIMER UN PROFESSEUR =====
router.delete("/professeurs/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Récupérer les infos du professeur
    const profResult = await pool.query(
      "SELECT id, username FROM users WHERE id = $1 AND role = 'prof'",
      [id]
    );
    
    if (profResult.rowCount === 0) {
      return res.status(404).json({ error: "Professeur non trouvé" });
    }

    const username = profResult.rows[0].username;

    // Supprimer les appels associés
    await pool.query(
      "DELETE FROM appels WHERE prof_username = $1 OR eleve_username = $1",
      [username]
    );

    // Supprimer les heures associées (si la table existe)
    try {
      await pool.query(
        "DELETE FROM heures_prof WHERE username = $1",
        [username]
      );
    } catch (err) {
      // Table n'existe pas, on continue
      console.log("⚠️ Table heures_prof n'existe pas");
    }

    // Supprimer de users
    await pool.query(
      "DELETE FROM users WHERE id = $1",
      [id]
    );

    res.json({ 
      message: "Professeur supprimé avec succès", 
      prof: profResult.rows[0] 
    });
  } catch (err) {
    console.error("❌ Erreur DELETE professeur:", err.message);
    res.status(500).json({ error: "Impossible de supprimer le professeur" });
  }
});

// ===== GET TOUS LES UTILISATEURS =====
router.get("/users", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, username, prenom, nom, email, role, statut FROM users ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur GET users:", err.message);
    res.status(500).json({ error: "Impossible de récupérer les utilisateurs" });
  }
});

// ===== DELETE UN UTILISATEUR =====
router.delete("/users/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const userResult = await pool.query(
      "SELECT username FROM users WHERE id = $1",
      [id]
    );

    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: "Utilisateur non trouvé" });
    }

    const username = userResult.rows[0].username;

    // Supprimer les appels associés
    await pool.query(
      "DELETE FROM appels WHERE prof_username = $1 OR eleve_username = $1",
      [username]
    );

    // Supprimer l'utilisateur
    await pool.query("DELETE FROM users WHERE id = $1", [id]);

    res.json({ message: "Utilisateur supprimé avec succès" });
  } catch (err) {
    console.error("❌ Erreur DELETE user:", err.message);
    res.status(500).json({ error: "Impossible de supprimer l'utilisateur" });
  }
});

export default router;