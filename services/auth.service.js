// services/auth.service.js
import bcrypt from "bcryptjs";
import { sequelize as db } from "../config/index.js";
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
  stripe_customer_id, // Pour l'élève
  stripe_account_id,  // Pour le prof
  is_active           // Statut de validation
}) {
  const normalizedEmail = normalizeEmail(email);
  const hashed = await hashPassword(password);

  try {
    const result = await db.query(
      `
      INSERT INTO users (
        username, prenom, nom, email, telephone, pays, ville, 
        password, role, stripe_customer_id, stripe_account_id, 
        is_active, date_inscription
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id, username, prenom, nom, email, role, stripe_customer_id, stripe_account_id, is_active
      `,
      {
        replacements: [
          username || null,        // $1
          prenom,                 // $2
          nom,                    // $3
          normalizedEmail,        // $4
          telephone || null,      // $5
          pays || null,           // $6
          ville || null,          // $7
          hashed,                 // $8
          role || "eleve",        // $9
          stripe_customer_id || null, // $10
          stripe_account_id || null,  // $11
          is_active ?? (role === "eleve") // $12: Actif par défaut pour élève, false pour prof
        ]
      }
    );

    const user = result[0][0];
    logger.info("Utilisateur créé avec succès", { userId: user.id, role: user.role });
    return user;

  } catch (err) {
    if (err?.code === "23505") {
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
    `SELECT id, username, prenom, nom, email, role, is_active, stripe_customer_id, stripe_account_id 
     FROM users WHERE email = $1`,
    { replacements: [normalizedEmail] }
  );
  return result[0][0] || null;
}

// ------------------------------
// FIND BY EMAIL + PASSWORD
// ------------------------------
export async function findByEmailWithPassword(email) {
  const normalizedEmail = normalizeEmail(email);
  const result = await db.query(
    `SELECT id, username, prenom, nom, email, telephone, pays, ville, role, password, stripe_customer_id FROM users WHERE email = $1`,
    { replacements: [normalizedEmail] }
  );
  return result[0][0] || null;
}

// ------------------------------
// FIND BY USERNAME + PASSWORD
// ------------------------------
export async function findByUsernameWithPassword(username) {
  const result = await db.query(
    `SELECT id, username, prenom, nom, email, telephone, pays, ville, role, password, stripe_customer_id FROM users WHERE username = $1`,
    { replacements: [username] }
  );
  return result[0][0] || null;
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
    `SELECT id, username, prenom, nom, email, telephone, pays, ville, role, stripe_customer_id FROM users WHERE id = $1`,
    { replacements: [id] }
  );
  return result[0][0] || null;
}

// ------------------------------
// RESET PASSWORD FUNCTIONS
// ------------------------------
export async function saveResetToken(userId, token, expires) {
  await db.query(
    `UPDATE users SET resetToken = $1, resetTokenExpires = $2 WHERE id = $3`,
    { replacements: [token, expires, userId] }
  );
}

export async function findByResetToken(token) {
  const result = await db.query(
    `SELECT id AS userId, resetToken, resetTokenExpires FROM users WHERE resetToken = $1`,
    { replacements: [token] }
  );
  const user = result[0][0] || null;
  if (!user || (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date())) return null;
  return user;
}

export async function updatePassword(userId, newPassword) {
  const hashed = await hashPassword(newPassword);
  await db.query(`UPDATE users SET password = $1 WHERE id = $2`, { replacements: [hashed, userId] });
}

export async function clearResetToken(userId) {
  await db.query(`UPDATE users SET resetToken = NULL, resetTokenExpires = NULL WHERE id = $1`, { replacements: [userId] });
}