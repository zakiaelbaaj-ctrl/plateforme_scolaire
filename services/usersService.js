// --------------------------------------------------
// services/usersService.js – version finale Node ESM
// --------------------------------------------------

import bcrypt from "bcryptjs";
import { sequelize as db } from "#config/index.js";
import { QueryTypes } from "sequelize";
import logger from "#config/logger.js";
// ✅ IMPORT DU MODÈLE POUR MODERNISER LE SERVICE
import User from "../models/user.model.js";
// ------------------------------
// Utils
// ------------------------------

export function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

export async function hashPassword(password) {
    if (!password || typeof password !== "string") {
        throw new Error("Invalid password");
    }
    return bcrypt.hash(password, 12);
}

export async function comparePassword(password, hash) {
    const safeHash = hash || "?a?$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
    return bcrypt.compare(password || "", safeHash);
}
// ------------------------------
// FINDERS
// ------------------------------
/**
 * Trouver un utilisateur par son email
 * @param {string} email 
 * @param {boolean} includePassword - Si vrai, inclut le champ password (utile pour le login)
 */
export async function findByEmail(email, includePassword = false) {
    const normalizedEmail = email.trim().toLowerCase();
    
    const options = {
        where: { email: normalizedEmail }
    };

    // Si on a besoin du password (pour la comparaison au login), 
    // on force Sequelize à l'inclure malgré la protection toJSON
    if (includePassword) {
        options.attributes = { include: ['password'] };
    }

    return await User.findOne(options);
}

export async function findByUsernameWithPassword(username) {
    const [result] = await db.query(
        `SELECT * FROM users WHERE username = ?`,
        { replacements: [username], type: QueryTypes.SELECT }
    );
    return result || null;
}

// ------------------------------
// ADMIN & UPDATE FUNCTIONS
// ------------------------------

/**
 * ✅ Mise à jour générique (PATCH)
 */
export async function updateUser(userId, data) {
    // Liste des colonnes autorisées pour éviter les injections ou erreurs SQL
    const allowedColumns = [
        "statut", "is_active", "role", "prenom", "nom", 
        "telephone", "ville", "pays", "matiere", "niveau", 
        "is_university_prof", "is_subscriber",
        "has_payment_method", "stripe_customer_id"
        ];
    
    const fields = Object.keys(data).filter(key => allowedColumns.includes(key));
    if (fields.length === 0) return await findById(userId);

    const setClause = fields.map(field => `"${field}" = ?`).join(", ");
    const replacements = [...fields.map(f => data[f]), userId];

    const [result] = await db.query(
        `UPDATE users SET ${setClause} WHERE id = ? RETURNING *`,
        { replacements, type: QueryTypes.UPDATE }
    );

    return result ? result[0] : null;
}

export async function findByRole(role) {
    return await db.query(
        `SELECT * FROM users WHERE role = ? ORDER BY id ASC`,
        { replacements: [role], type: QueryTypes.SELECT }
    );
}

export async function findAllUsers() {
    return await db.query(
        "SELECT * FROM users ORDER BY id ASC",
        { type: QueryTypes.SELECT }
    );
}

export async function updateStatus(userId, statut) {
    const [result] = await db.query(
        `UPDATE users SET statut = ? WHERE id = ? RETURNING *`,
        { replacements: [statut, userId], type: QueryTypes.UPDATE }
    );
    return result ? result[0] : null;
}

export async function deleteUser(userId) {
    const [result] = await db.query(
        `DELETE FROM users WHERE id = ? RETURNING id`,
        { replacements: [userId], type: QueryTypes.DELETE }
    );
    return result || null;
}

// ------------------------------
// RESET PASSWORD
// ------------------------------

export async function saveResetToken(userId, token, expires) {
    await db.query(
        `UPDATE users SET "resetToken" = ?, "resetTokenExpires" = ? WHERE id = ?`,
        { replacements: [token, expires, userId], type: QueryTypes.UPDATE }
    );
}

export async function findByResetToken(token) {
    const [user] = await db.query(
        `SELECT id AS "userId", "resetToken", "resetTokenExpires" FROM users WHERE "resetToken" = ?`,
        { replacements: [token], type: QueryTypes.SELECT }
    );

    if (!user) return null;
    if (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date()) return null;

    return user;
}

export async function updatePassword(userId, newPassword) {
    const hashed = await hashPassword(newPassword);
    await db.query(
        `UPDATE users SET password = ? WHERE id = ?`,
        { replacements: [hashed, userId], type: QueryTypes.UPDATE }
    );
}

// --------------------------------------------------
// FACTURES, PAIEMENTS & RELANCES
// --------------------------------------------------

export async function getFactures() {
    return await db.query(
        `SELECT * FROM factures ORDER BY date DESC`,
        { type: QueryTypes.SELECT }
    );
}

export async function getStripeInvoices() {
    return await db.query(
        `SELECT * FROM stripe_invoices ORDER BY created DESC`,
        { type: QueryTypes.SELECT }
    );
}

export async function deleteStripeInvoice(id) {
    await db.query(
        `DELETE FROM stripe_invoices WHERE id = ?`,
        { replacements: [id], type: QueryTypes.DELETE }
    );
}

export async function getPaiements() {
    return await db.query(
        `SELECT * FROM paiements ORDER BY date DESC`,
        { type: QueryTypes.SELECT }
    );
}

export async function getRelances() {
    return await db.query(
        `SELECT * FROM relances ORDER BY last_relance DESC NULLS LAST`,
        { type: QueryTypes.SELECT }
    );
}

export async function sendRelance(id) {
    await db.query(
        `UPDATE relances SET status = 'envoyee', last_relance = NOW() WHERE id = ?`,
        { replacements: [id], type: QueryTypes.UPDATE }
    );
}

export async function deleteRelance(id) {
    await db.query(
        `DELETE FROM relances WHERE id = ?`,
        { replacements: [id], type: QueryTypes.DELETE }
    );
}
// --------------------------------------------------
// AGGRÉGATIONS FINANCIÈRES (Pour le Hub Facturation)
// --------------------------------------------------

/**
 * Calcule le total des revenus (Somme de tous les paiements)
 */
export async function getTotalRevenus() {
    try {
        const [result] = await db.query(
            `SELECT SUM(montant) as total FROM paiements`,
            { type: QueryTypes.SELECT }
        );
        return result?.total || 0;
    } catch (err) {
        logger.error("Error getTotalRevenus", err);
        return 0;
    }
}

/**
 * Récupère les 5 dernières factures pour l'aperçu du Hub
 */
export async function getDernieresFactures() {
    try {
return await db.query(
    `SELECT id, montant, date, type FROM factures ORDER BY date DESC LIMIT 5`,
    { type: QueryTypes.SELECT }
);
    } catch (err) {
        logger.error("Error getDernieresFactures", err);
        return [];
    }
}
export async function createUser(data) {
    try {
        // ✅ Utilisation du Modèle au lieu du SQL Brut (Beaucoup plus court !)
        const isStudent = (data.role === 'eleve' || data.role === 'etudiant');
        
        const user = await User.create({
            ...data,
            statut: isStudent ? 'active' : 'pending',
            is_active: isStudent
        });

        return user;
    } catch (err) {
        logger.error("❌ createUser error", err);
        throw err;
    }
}

export async function findById(id) {
    // ✅ Utilisation du Modèle : plus besoin d'écrire le SELECT manuellement
    return await User.findByPk(id);
}
