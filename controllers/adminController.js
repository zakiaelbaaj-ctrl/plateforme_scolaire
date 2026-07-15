// ============================================================
// adminController.js – VERSION FINALE ROBUSTE (SENIOR+++)
// ============================================================

import * as usersService from "#services/usersService.js";
import logger from "#config/logger.js";

/**
 * Helper interne pour nettoyer les données sensibles avant envoi au frontend
 */
const filterSensitiveData = (user) => {
    if (!user) return null;
    // Si c'est un objet Sequelize, on le convertit en JSON pur
    const u = user.toJSON ? user.toJSON() : user;
    const { password, resetToken, resetTokenExpires, ...safeUser } = u;
    return safeUser;
};

// --------------------------------------------------
// GET /admin/users
// Liste complète ou par rôle
// --------------------------------------------------
export async function getUsers(req, res) {
    try {
        const { role } = req.query;
        let users = role 
            ? await usersService.findByRole(role) 
            : await usersService.findAllUsers();

        const safeUsers = (users || []).map(filterSensitiveData);

        return res.status(200).json({
            success: true,
            count: safeUsers.length,
            users: safeUsers
        });
    } catch (err) {
        logger.error("❌ Erreur getUsers", { message: err.message });
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

// --------------------------------------------------
// GET /admin/users/:id
// Récupérer un utilisateur spécifique
// --------------------------------------------------
export async function getUserById(req, res) {
    try {
        const user = await usersService.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
        }
        return res.status(200).json({ success: true, user: filterSensitiveData(user) });
    } catch (err) {
        logger.error("❌ Erreur getUserById", { message: err.message });
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

// --------------------------------------------------
// PATCH /admin/users/:id
// ✅ CORRECTION : Gère les appels PATCH du Dashboard Admin
// --------------------------------------------------
export async function updateUser(req, res) {
    try {
        const userId = req.params.id;
        const updates = req.body; 

        // On délègue la mise à jour au service
        const updated = await usersService.updateUser(userId, updates);

        if (!updated) {
            return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
        }

        return res.status(200).json({
            success: true,
            message: "Utilisateur mis à jour avec succès",
            user: filterSensitiveData(updated)
        });
    } catch (err) {
        logger.error("❌ Erreur updateUser", { message: err.message, userId: req.params.id });
        return res.status(500).json({ success: false, message: "Erreur lors de la mise à jour" });
    }
}

// --------------------------------------------------
// PUT /admin/users/:id/status
// --------------------------------------------------
export async function updateStatus(req, res) {
    try {
        const userId = req.params.id;
        const { statut } = req.body;

        const allowed = ["pending", "active", "rejected"];
        if (!allowed.includes(statut)) {
            return res.status(400).json({ success: false, message: "Statut invalide" });
        }

        const updated = await usersService.updateStatus(userId, statut);

        if (!updated) {
            return res.status(404).json({ success: false, message: "Utilisateur introuvable" });
        }

        return res.status(200).json({
            success: true,
            message: "Statut mis à jour",
            user: filterSensitiveData(updated)
        });
    } catch (err) {
        logger.error("❌ Erreur updateStatus", { message: err.message });
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

// --------------------------------------------------
// DELETE /admin/users/:id
// --------------------------------------------------
export async function deleteUser(req, res) {
    try {
        const deleted = await usersService.deleteUser(req.params.id);
        if (!deleted) return res.status(404).json({ success: false, message: "Utilisateur introuvable" });

        return res.status(200).json({ success: true, message: "Utilisateur supprimé" });
    } catch (err) {
        logger.error("❌ Erreur deleteUser", { message: err.message });
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

// --------------------------------------------------
// FACTURATION, PAIEMENTS & RELANCES
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

export async function getStripeInvoices(req, res) {
    try {
        const invoices = await usersService.getStripeInvoices();
        return res.status(200).json({ success: true, data: invoices });
    } catch (err) {
        logger.error("❌ Erreur getStripeInvoices", err);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

export async function deleteStripeInvoice(req, res) {
    try {
        await usersService.deleteStripeInvoice(req.params.id);
        return res.status(200).json({ success: true, message: "Facture Stripe supprimée" });
    } catch (err) {
        logger.error("❌ Erreur deleteStripeInvoice", err);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

export async function getPaiements(req, res) {
    try {
        const paiements = await usersService.getPaiements();
        return res.status(200).json({ success: true, paiements });
    } catch (err) {
        logger.error("❌ Erreur getPaiements", err);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

export async function getRelances(req, res) {
    try {
        const relances = await usersService.getRelances();
        return res.status(200).json({ success: true, data: relances });
    } catch (err) {
        logger.error("❌ Erreur getRelances", err);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

export async function sendRelance(req, res) {
    try {
        await usersService.sendRelance(req.params.id);
        return res.status(200).json({ success: true, message: "Relance envoyée" });
    } catch (err) {
        logger.error("❌ Erreur sendRelance", err);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}

export async function deleteRelance(req, res) {
    try {
        await usersService.deleteRelance(req.params.id);
        return res.status(200).json({ success: true, message: "Relance supprimée" });
    } catch (err) {
        logger.error("❌ Erreur deleteRelance", err);
        return res.status(500).json({ success: false, message: "Erreur serveur" });
    }
}
export const getFacturation = async (req, res) => {
    try {
        // 1. On récupère les données depuis ton service ou ta DB
        // (Remplace par tes vrais appels de fonctions SQL/Sequelize)
        const total = await usersService.getTotalRevenus(); 
        const rows = await usersService.getDernieresFactures(); 

        // 2. On envoie la réponse formatée au frontend
        res.json({ 
            success: true, 
            data: {
                // parseFloat sécurise le calcul pour le .toFixed(2) du frontend
                total_revenus: parseFloat(total || 0), 
                // rows || [] évite l'erreur .map() ou .forEach() si c'est vide
                factures_recentes: rows || []
            } 
        });
    } catch (error) {
        logger.error("❌ Erreur getFacturation", { message: error.message });
        res.status(500).json({ success: false, message: "Erreur lors de la récupération des données financières" });
    }
};
