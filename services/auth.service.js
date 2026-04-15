// services/auth.service.js
import bcrypt from "bcryptjs";
import { sequelize as db } from "../config/index.js";
import { QueryTypes } from "sequelize"; // Ajout de l'import pour les types de requêtes
import logger from "../config/logger.js";

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
const DUMMY_HASH = "$2a$12$XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";

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
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password, hash) {
  const safeHash = hash || DUMMY_HASH;
  return bcrypt.compare(password || "", safeHash);
}

// ------------------------------
// CREATE USER
// ------------------------------

export async function createUser({
  username,
  prenom,
  nom,
  email,
  telephone,
  pays,
  ville,
  password,
  role,
  stripe_customer_id,
  stripe_account_id,
  is_active
}) {
  const normalizedEmail = normalizeEmail(email);
  const hashed = await hashPassword(password);

  try {
    // Correction de la double déclaration et de la syntaxe du template string
    const [result] = await db.query(
      `
      INSERT INTO users (
        username, prenom, nom, email, telephone, pays, ville, 
        password, role, stripe_customer_id, stripe_account_id, 
        is_active, has_payment_method, date_inscription
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW()) 
      RETURNING id, username, prenom, nom, email, role, stripe_customer_id, stripe_account_id, is_active, has_payment_method
      `,
      {
        replacements: [
          username || null,               // 1
          prenom,                         // 2
          nom,                            // 3
          normalizedEmail,                // 4
          telephone || null,              // 5
          pays || "France",               // 6
          ville || null,                  // 7
          hashed,                         // 8
          role || "eleve",                // 9
          stripe_customer_id || null,     // 10
          stripe_account_id || null,      // 11
          is_active ?? (role === "eleve"),// 12
          false                           // 13: has_payment_method
        ],
        type: QueryTypes.INSERT
      }
    );

    const user = result && result.length > 0 ? result[0] : null;
    logger.info("Utilisateur créé avec succès", { userId: user?.id, role: user?.role });
    return user;

  } catch (err) {
    if (err?.original?.code === "23505" || err?.code === "23505") {
      throw new Error("Email ou nom d'utilisateur déjà utilisé");
    }
    logger.error("createUser error:", err);
    throw err;
  }
}

// ------------------------------
// FIND BY EMAIL
// ------------------------------
export async function findByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  
  const result = await db.query(
    `SELECT 
        id, username, prenom, nom, email, role, 
        is_active, has_payment_method, stripe_customer_id, stripe_account_id 
     FROM users 
     WHERE email = ?`, 
    { 
      replacements: [normalizedEmail],
      type: QueryTypes.SELECT 
    }
  );

  return result && result.length > 0 ? result[0] : null;
}

// ------------------------------
// FIND BY EMAIL + PASSWORD
// ------------------------------
export async function findByEmailWithPassword(email) {
  const normalizedEmail = normalizeEmail(email);
  const result = await db.query(
    `SELECT id, username, prenom, nom, email, telephone, pays, ville, role, password, stripe_customer_id, has_payment_method, is_active FROM users WHERE email = ?`,
    { 
      replacements: [normalizedEmail],
      type: QueryTypes.SELECT
    }
  );
  return result && result.length > 0 ? result[0] : null;
}

// ------------------------------
// FIND BY USERNAME + PASSWORD
// ------------------------------
export async function findByUsernameWithPassword(username) {
  const result = await db.query(
    `SELECT id, username, prenom, nom, email, telephone, pays, ville, role, password, stripe_customer_id, has_payment_method, is_active FROM users WHERE username = ?`,
    { 
      replacements: [username],
      type: QueryTypes.SELECT
    }
  );
  return result && result.length > 0 ? result[0] : null;
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
  const result = await db.query(
    `SELECT id, username, prenom, nom, email, telephone, pays, ville, role, stripe_customer_id, has_payment_method FROM users WHERE id = ?`,
    { 
      replacements: [id],
      type: QueryTypes.SELECT
    }
  );
  return result && result.length > 0 ? result[0] : null;
}

// ------------------------------
// RESET PASSWORD FUNCTIONS
// ------------------------------
/**
 * Sauvegarde le token et définit l'expiration à +1 heure
 */
export async function saveResetToken(userId, token) {
  // Calcul interne : 3 600 000 ms = 1 heure
  const expires = new Date(Date.now() + 3600000); 
  
  await db.query(
    `UPDATE users 
     SET "resetToken" = ?, "resetTokenExpires" = ? 
     WHERE id = ?`,
    { 
      replacements: [token, expires, userId],
      type: QueryTypes.UPDATE
    }
  );
}

export async function findByResetToken(token) {
  const result = await db.query(
    `SELECT id AS "userId", "resetToken", "resetTokenExpires" FROM users WHERE "resetToken" = ?`,
    { 
      replacements: [token],
      type: QueryTypes.SELECT
    }
  );
  const user = result && result.length > 0 ? result[0] : null;
  if (!user || (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date())) return null;
  return user;
}

export async function updatePassword(userId, newPassword) {
  const hashed = await hashPassword(newPassword);
  await db.query(
    `UPDATE users SET password = ? WHERE id = ?`, 
    { 
      replacements: [hashed, userId],
      type: QueryTypes.UPDATE
    }
  );
}

export async function clearResetToken(userId) {
  await db.query(
    `UPDATE users SET "resetToken" = NULL, "resetTokenExpires" = NULL WHERE id = ?`, 
    { 
      replacements: [userId],
      type: QueryTypes.UPDATE
    }
  );
}