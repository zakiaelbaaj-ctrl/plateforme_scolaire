// --------------------------------------------------
// services/usersService.js – version finale Node ESM
// --------------------------------------------------

import bcrypt from "bcryptjs";
import { sequelize as db } from "#config/index.js";
import { QueryTypes } from "sequelize";
import logger from "#config/logger.js";

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
// CREATE USER
// ------------------------------

export async function createUser(data) {
    try {
        const {
            username, prenom, nom, email, telephone, ville, pays, 
            password, role, matiere, niveau, diplome_url,
            stripe_customer_id
        } = data;

        const normalizedEmail = normalizeEmail(email);
        const hashed = await hashPassword(password);

        // ✅ Logique automatique : seuls les profs sont mis en attente
        const isStudent = (role === 'eleve' || role === 'etudiant');
        const finalStatut = isStudent ? 'active' : 'pending';
        const finalIsActive = isStudent ? true : false; // Forçage booléen

        const [result] = await db.query(
        `INSERT INTO users 
        (username, prenom, nom, email, telephone, ville, pays, password, role, statut, is_active, matiere, niveau, diplome_url, stripe_customer_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) -- ✅ 2. Ajouter un "?"
        RETURNING id, username, email, role, statut, is_active, stripe_customer_id, date_inscription`,
        {
                replacements: [
                    username || null, 
                    prenom, 
                    nom, 
                    normalizedEmail, 
                    telephone || null, 
                    ville || null, 
                    pays || "France", 
                    hashed, 
                    role || "eleve", 
                    finalStatut, 
                   finalIsActive,
                   matiere || null, 
                   niveau || null, 
                   diplome_url || null,
                   stripe_customer_id || null // ✅ 3. L'ajouter à la fin
                 ],
                 type: QueryTypes.INSERT
               }
                );

        // ✅ Retour sécurisé pour éviter le "undefined"
        return result && result.length > 0 ? result[0] : null;

    } catch (err) {
        logger.error("❌ createUser error", err);
        // Gestion des doublons
        if (err?.original?.code === "23505") {
            const detail = err.original.detail || "";
            if (detail.includes("email")) throw new Error("Email déjà existant");
            if (detail.includes("username")) throw new Error("Nom d'utilisateur déjà pris");
        }
        throw err;
    }
}
// ------------------------------
// FINDERS
// ------------------------------
export async function findByEmail(email) {
    const [result] = await db.query(
        `SELECT id, email, prenom, nom, role, has_payment_method, stripe_customer_id, is_active, statut FROM users WHERE email = ?`,
        { replacements: [normalizeEmail(email)], type: QueryTypes.SELECT }
    );
    return result || null;
}

export async function findByEmailWithPassword(email) {
    const [result] = await db.query(
        `SELECT * FROM users WHERE email = ?`,
        { replacements: [normalizeEmail(email)], type: QueryTypes.SELECT }
    );
    return result || null;
}

export async function findByUsernameWithPassword(username) {
    const [result] = await db.query(
        `SELECT * FROM users WHERE username = ?`,
        { replacements: [username], type: QueryTypes.SELECT }
    );
    return result || null;
}

// services/usersService.js

export async function findById(id) {
  const result = await db.query(
    `SELECT id, email, prenom, nom, role, ville, pays, 
            stripe_customer_id, 
            has_payment_method, 
            is_active, statut 
     FROM users WHERE id = ?`, // ✅ Utilise "?" au lieu de "$1"
    { replacements: [id], type: QueryTypes.SELECT }
  );
  return result && result.length > 0 ? result[0] : null; // ✅ Syntaxe Sequelize
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