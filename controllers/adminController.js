// --------------------------------------------------
// Admin Controller – Version professionnelle
// --------------------------------------------------

import * as usersService from "#services/usersService.js";
import logger from "#config/logger.js";

// --------------------------------------------------
// GET /admin/users
// Récupérer tous les utilisateurs
// --------------------------------------------------
export async function getUsers(req, res) {
  try {
    const { role } = req.query;
    let users;

    if (role) {
      // Utilise la fonction findByRole que nous avons vérifiée dans le service
      users = await usersService.findByRole(role);
    } else {
      // On appelle une fonction globale du service (voir l'ajout ci-dessous)
      // On évite d'utiliser "db" directement ici pour respecter l'architecture
      users = await usersService.findAllUsers(); 
    }

    if (!users || users.length === 0) {
      return res.status(200).json({
        success: true,
        users: [],
        message: "Aucun utilisateur trouvé"
      });
    }

    // Retrait des données sensibles
    const safeUsers = users.map(u => {
      const { password, resetToken, resetTokenExpires, ...rest } = u;
      return rest;
    });

    return res.status(200).json({
      success: true,
      count: safeUsers.length,
      users: safeUsers
    });

  } catch (err) {
    logger.error("❌ Erreur getUsers", {
      message: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la récupération des utilisateurs"
    });
  }
}
// --------------------------------------------------
// PUT /admin/users/:id/status
// Modifier le statut d’un utilisateur
// --------------------------------------------------
export async function updateStatus(req, res) {
  try {
    const userId = req.params.id;
    const { statut } = req.body;

    // Validation stricte
    const allowed = ["pending", "active", "rejected"];
    if (!allowed.includes(statut)) {
      return res.status(400).json({
        success: false,
        message: `Statut invalide. Valeurs autorisées : ${allowed.join(", ")}`
      });
    }

    const updated = await usersService.updateStatus(userId, statut);

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    const { password, resetToken, resetTokenExpires, ...safeUser } = updated;

    return res.status(200).json({
      success: true,
      message: "Statut mis à jour avec succès",
      user: safeUser
    });

  } catch (err) {
    logger.error("❌ Erreur updateStatus", {
      message: err.message,
      stack: err.stack,
      userId: req.params.id
    });

    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la mise à jour du statut"
    });
  }
}

// --------------------------------------------------
// DELETE /admin/users/:id
// Supprimer un utilisateur
// --------------------------------------------------
export async function deleteUser(req, res) {
  try {
    const userId = req.params.id;

    const deleted = await usersService.deleteUser(userId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Utilisateur supprimé avec succès",
      deletedUserId: userId
    });

  } catch (err) {
    logger.error("❌ Erreur deleteUser", {
      message: err.message,
      stack: err.stack,
      userId: req.params.id
    });

    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de la suppression de l'utilisateur"
    });
  }
}
// --------------------------------------------------
// GET /admin/factures
// --------------------------------------------------
export async function getFactures(req, res) {
  try {
    const factures = await usersService.getFactures();
    return res.status(200).json({ success: true, data: factures });
  } catch (err) {
    logger.error("❌ Erreur getFactures", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// GET /admin/stripe/invoices
// --------------------------------------------------
export async function getStripeInvoices(req, res) {
  try {
    const invoices = await usersService.getStripeInvoices();
    return res.status(200).json({ success: true, data: invoices });
  } catch (err) {
    logger.error("❌ Erreur getStripeInvoices", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// DELETE /admin/stripe/invoices/:id
// --------------------------------------------------
export async function deleteStripeInvoice(req, res) {
  try {
    const id = req.params.id;
    await usersService.deleteStripeInvoice(id);
    return res.status(200).json({ success: true, message: "Facture Stripe supprimée" });
  } catch (err) {
    logger.error("❌ Erreur deleteStripeInvoice", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// GET /admin/paiements
// --------------------------------------------------
export async function getPaiements(req, res) {
  try {
    const paiements = await usersService.getPaiements();
    return res.status(200).json({ success: true, paiements });
  } catch (err) {
    logger.error("❌ Erreur getPaiements", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// GET /admin/relances
// --------------------------------------------------
export async function getRelances(req, res) {
  try {
    const relances = await usersService.getRelances();
    return res.status(200).json({ success: true, data: relances });
  } catch (err) {
    logger.error("❌ Erreur getRelances", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// POST /admin/relances/:id/send
// --------------------------------------------------
export async function sendRelance(req, res) {
  try {
    const id = req.params.id;
    await usersService.sendRelance(id);
    return res.status(200).json({ success: true, message: "Relance envoyée" });
  } catch (err) {
    logger.error("❌ Erreur sendRelance", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}

// --------------------------------------------------
// DELETE /admin/relances/:id
// --------------------------------------------------
export async function deleteRelance(req, res) {
  try {
    const id = req.params.id;
    await usersService.deleteRelance(id);
    return res.status(200).json({ success: true, message: "Relance supprimée" });
  } catch (err) {
    logger.error("❌ Erreur deleteRelance", err);
    return res.status(500).json({ success: false, message: "Erreur serveur" });
  }
}
