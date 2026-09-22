// --------------------------------------------------
// Admin Routes – Version professionnelle
// --------------------------------------------------

import express from "express";
import { requireAuth } from "#middlewares/requireAuth.js";
import { requireAdmin } from "#middlewares/requireAdmin.js";
import * as adminController from "#controllers/adminController.js";
import { pool } from "../../../config/db.js";

const router = express.Router();

// --------------------------------------------------
// Middlewares globaux pour toutes les routes admin (ci-dessous)
// --------------------------------------------------
router.use(requireAuth);
router.use(requireAdmin);

// --------------------------------------------------
// GET /admin/users
// Liste complète des utilisateurs
// --------------------------------------------------
router.get("/facturation", adminController.getFacturation);
router.get("/users", adminController.getUsers);
// 2. AJOUTER : Récupérer un utilisateur spécifique par ID (évite le 404 en GET)
router.get("/users/:id", adminController.getUserById);
// 3. AJOUTER : Validation/Mise à jour (PATCH) utilisée par ton admin_inscriptions.html
// Cette route répondra à api/v1/admin/users/40
router.patch("/users/:id", adminController.updateUser); 

// --------------------------------------------------
// PUT /admin/users/:id/status
// Modifier le statut d'un utilisateur
// -------------------------------------------------
router.put("/users/:id/status", adminController.updateStatus);
// --------------------------------------------------
// DELETE /admin/users/:id
// Supprimer un utilisateur
// --------------------------------------------------
router.delete("/users/:id", adminController.deleteUser);

// --------------------------------------------------
// GET /admin/factures
// Liste des factures PDF internes
// --------------------------------------------------
router.get("/factures", adminController.getFactures);

// --------------------------------------------------
// GET /admin/stripe/invoices
// Liste des factures Stripe officielles
// --------------------------------------------------
router.get("/stripe/invoices", adminController.getStripeInvoices);

// --------------------------------------------------
// DELETE /admin/stripe/invoices/:id
// Supprimer une facture Stripe
// --------------------------------------------------
router.delete("/stripe/invoices/:id", adminController.deleteStripeInvoice);

// --------------------------------------------------
// GET /admin/paiements
// Liste des paiements
// --------------------------------------------------
router.get("/paiements", adminController.getPaiements);

// --------------------------------------------------
// GET /admin/relances
// Liste des relances
// --------------------------------------------------
router.get("/relances", adminController.getRelances);

// --------------------------------------------------
// POST /admin/relances/:id/send
// Envoyer une relance
// --------------------------------------------------
router.post("/relances/:id/send", adminController.sendRelance);

// --------------------------------------------------
// DELETE /admin/relances/:id
// Supprimer une relance
// --------------------------------------------------
router.delete("/relances/:id", adminController.deleteRelance);

// --------------------------------------------------
// Export
// --------------------------------------------------
// --------------------------------------------------
// GET /admin/versements
// Ce qui reste du aux professeurs non payes par Stripe.
// --------------------------------------------------
router.get("/versements", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id AS prof_id, u.prenom, u.nom, u.email,
              u.pays, u.pays_code, u.mode_versement,
              (COUNT(*) FILTER (WHERE v.statut = 'du'))::int AS sessions_dues,
              COALESCE(SUM(v.montant_cents) FILTER (WHERE v.statut = 'du'), 0)::int AS total_du,
              COALESCE(SUM(v.montant_cents) FILTER (WHERE v.statut = 'verse'), 0)::int AS total_verse,
              MIN(v.created_at) FILTER (WHERE v.statut = 'du') AS plus_ancienne
         FROM versements_dus v
         JOIN users u ON u.id = v.prof_id
        GROUP BY u.id
       HAVING COUNT(*) FILTER (WHERE v.statut = 'du') > 0
        ORDER BY total_du DESC`
    );
    res.json({ professeurs: rows });
  } catch (err) {
    console.error("❌ admin versements:", err.message);
    res.status(500).json({ message: "Erreur DB" });
  }
});

// --------------------------------------------------
// POST /admin/versements/:profId/verser
// Marque comme verse tout ce qui etait du a ce professeur.
// La reference du virement est obligatoire : sans elle, impossible
// de rapprocher une ligne d un mouvement bancaire.
// --------------------------------------------------
router.post("/versements/:profId/verser", async (req, res) => {
  const profId = parseInt(req.params.profId, 10);
  if (Number.isNaN(profId)) {
    return res.status(400).json({ message: "Identifiant invalide" });
  }

  const reference = String(req.body?.reference || "").trim().slice(0, 120);
  if (!reference) {
    return res.status(400).json({ message: "Reference du virement obligatoire" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `UPDATE versements_dus
          SET statut = 'verse', verse_le = now(), reference = $2
        WHERE prof_id = $1 AND statut = 'du'
        RETURNING id, montant_cents`,
      [profId, reference]
    );

    await client.query(
      `UPDATE users
          SET balance = COALESCE((
                SELECT SUM(montant_cents)
                  FROM versements_dus
                 WHERE prof_id = $1 AND statut = 'du'
              ), 0) / 100.0
        WHERE id = $1`,
      [profId]
    );

    await client.query("COMMIT");

    const total = rows.reduce((somme, r) => somme + r.montant_cents, 0);
    res.json({ lignes: rows.length, total_cents: total, reference });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ admin verser:", err.message);
    res.status(500).json({ message: "Erreur DB" });
  } finally {
    client.release();
  }
});

export default router;