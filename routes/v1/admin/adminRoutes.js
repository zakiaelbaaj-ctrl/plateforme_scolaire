// --------------------------------------------------
// Admin Routes – Version professionnelle
// --------------------------------------------------

import express from "express";
import { requireAuth } from "#middlewares/requireAuth.js";
import { requireAdmin } from "#middlewares/requireAdmin.js";
import * as adminController from "#controllers/adminController.js";

const router = express.Router();

// --------------------------------------------------
// Middlewares globaux pour toutes les routes admin
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
// Modifier le statut d’un utilisateur
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
export default router;
