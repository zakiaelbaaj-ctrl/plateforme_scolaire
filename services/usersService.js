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
      username,
      prenom,
      nom,
      email,
      telephone,
      ville,
      pays,
      password,
      role,
      statut,
      matiere,
      niveau,
      diplome_url
    } = data;

    const normalizedEmail = normalizeEmail(email);
    const hashed = await hashPassword(password);

    const [rows] = await db.query(
      `
      INSERT INTO users 
      (username, prenom, nom, email, telephone, ville, pays, password, role, statut, matiere, niveau, diplome_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, username, email, role, statut, date_inscription
      `,
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
          statut || "pending",
          matiere || null,
          niveau || null,
          diplome_url || null
        ],
        type: QueryTypes.INSERT
      }
    );

    return rows[0];

  } catch (err) {
    logger.error("createUser error", err);

    // Gestion des erreurs de contraintes uniques PostgreSQL (Code 23505)
    if (err?.original?.code === "23505" || err?.code === "23505") {
      const detail = err?.original?.detail || "";
      if (detail.includes("email")) {
        throw new Error("Email déjà existant");
      }
      if (detail.includes("username")) {
        throw new Error("Nom d'utilisateur déjà pris");
      }
    }

    throw err;
  }
}

// ------------------------------
// FIND BY EMAIL
// ------------------------------

export async function findByEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  const [result] = await db.query(
    `
    SELECT id, username, prenom, nom, email, telephone, pays, role, statut
    FROM users 
    WHERE email = ?
    `,
    { replacements: [normalizedEmail], type: QueryTypes.SELECT }
  );

  return result || null;
}

// ------------------------------
// FIND BY EMAIL + PASSWORD
// ------------------------------

export async function findByEmailWithPassword(email) {
  const normalizedEmail = normalizeEmail(email);

  const [result] = await db.query(
    `
    SELECT id, username, prenom, nom, email, telephone, ville, pays, role, statut, password
    FROM users 
    WHERE email = ?
    `,
    { replacements: [normalizedEmail], type: QueryTypes.SELECT }
  );

  return result || null;
}

// ------------------------------
// FIND BY USERNAME + PASSWORD
// ------------------------------

export async function findByUsernameWithPassword(username) {
  const results = await db.query(
    `
    SELECT id, username, prenom, nom, email, telephone, ville, pays, role, statut, password 
    FROM users 
    WHERE username = ?
    `,
    { replacements: [username], type: QueryTypes.SELECT }
  );

  return results[0] || null;
}

// ------------------------------
// VERIFY CREDENTIALS
// ------------------------------

export async function verifyCredentials({ email, username, password }) {
  let user = null;

  if (email) {
    user = await findByEmailWithPassword(email);
  } else if (username) {
    user = await findByUsernameWithPassword(username);
  }

  if (!user) return null;

  const valid = await comparePassword(password, user.password);

  if (!valid) {
    logger.warn("Invalid credentials", { email, username });
    return null;
  }

  const { password: _p, ...safe } = user;
  return safe;
}

// ------------------------------
// FIND BY ID
// ------------------------------

export async function findById(id) {
  const [result] = await db.query(
    `
    SELECT id, username, prenom, nom, email, telephone, ville, pays, role, statut
    FROM users 
    WHERE id = ?
    `,
    { replacements: [id], type: QueryTypes.SELECT }
  );

  return result || null;
}

// ------------------------------
// ADMIN FUNCTIONS
// ------------------------------

export async function findByRole(role) {
  const results = await db.query(
    `SELECT * FROM users WHERE role = ? ORDER BY id ASC`,
    { replacements: [role], type: QueryTypes.SELECT }
  );
  return results;
}

export async function findAllUsers() {
  const results = await db.query(
    "SELECT * FROM users ORDER BY id ASC",
    { type: QueryTypes.SELECT }
  );
  return results;
}

export async function updateStatus(userId, statut) {
  const [result] = await db.query(
    `
    UPDATE users
    SET statut = ?
    WHERE id = ?
    RETURNING id, username, prenom, nom, email, telephone, pays, role, statut
    `,
    { replacements: [statut, userId], type: QueryTypes.UPDATE }
  );

  // PostgreSQL retourne un tableau de résultats pour UPDATE avec RETURNING
  return Array.isArray(result) ? result[0] : result;
}

export async function deleteUser(userId) {
  const [result] = await db.query(
    `
    DELETE FROM users
    WHERE id = ?
    RETURNING id
    `,
    { replacements: [userId], type: QueryTypes.DELETE }
  );

  return result || null;
}

// ------------------------------
// RESET PASSWORD
// ------------------------------

export async function saveResetToken(userId, token, expires) {
  await db.query(
    `
    UPDATE users 
    SET "resetToken" = ?, "resetTokenExpires" = ? 
    WHERE id = ?
    `,
    { replacements: [token, expires, userId], type: QueryTypes.UPDATE }
  );
}

export async function findByResetToken(token) {
  const [user] = await db.query(
    `
    SELECT id AS "userId", "resetToken", "resetTokenExpires"
    FROM users 
    WHERE "resetToken" = ?
    `,
    { replacements: [token], type: QueryTypes.SELECT }
  );

  if (!user) return null;

  if (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date()) {
    logger.warn("Reset token expiré", { userId: user.userId });
    return null;
  }

  return user;
}

export async function updatePassword(userId, newPassword) {
  const hashed = await hashPassword(newPassword);

  await db.query(
    `
    UPDATE users 
    SET password = ? 
    WHERE id = ?
    `,
    { replacements: [hashed, userId], type: QueryTypes.UPDATE }
  );
}
// --------------------------------------------------
// FACTURES PDF INTERNES
// --------------------------------------------------
export async function getFactures() {
  const results = await db.query(
    `
    SELECT id, user_id, prenom, nom, email, montant, type, date, pdf_url
    FROM factures
    ORDER BY date DESC
    `,
    { type: QueryTypes.SELECT }
  );

  return results;
}
// --------------------------------------------------
// FACTURES STRIPE
// --------------------------------------------------
export async function getStripeInvoices() {
  const results = await db.query(
    `
    SELECT id, user_id, prenom, nom, email, amount_due, currency, status, created, invoice_id, pdf_url
    FROM stripe_invoices
    ORDER BY created DESC
    `,
    { type: QueryTypes.SELECT }
  );

  return results;
}

export async function deleteStripeInvoice(id) {
  await db.query(
    `
    DELETE FROM stripe_invoices
    WHERE id = ?
    `,
    { replacements: [id], type: QueryTypes.DELETE }
  );
}
// --------------------------------------------------
// PAIEMENTS
// --------------------------------------------------
export async function getPaiements() {
  const results = await db.query(
    `
    SELECT id, user_id, prenom, nom, email, montant, devise, type, status, date, stripe_id
    FROM paiements
    ORDER BY date DESC
    `,
    { type: QueryTypes.SELECT }
  );

  return results;
}
// --------------------------------------------------
// RELANCES
// --------------------------------------------------
export async function getRelances() {
  const results = await db.query(
    `
    SELECT id, user_id, prenom, nom, email, motif, montant, status, last_relance
    FROM relances
    ORDER BY last_relance DESC NULLS LAST
    `,
    { type: QueryTypes.SELECT }
  );

  return results;
}

export async function sendRelance(id) {
  await db.query(
    `
    UPDATE relances
    SET status = 'envoyee', last_relance = NOW()
    WHERE id = ?
    `,
    { replacements: [id], type: QueryTypes.UPDATE }
  );
}

export async function deleteRelance(id) {
  await db.query(
    `
    DELETE FROM relances
    WHERE id = ?
    `,
    { replacements: [id], type: QueryTypes.DELETE }
  );
}
