// services/auth.service.js
// --------------------------------------------------
// Service d'authentification – adapté à ta base users
// --------------------------------------------------

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
// CREATE USER (adapté à ta base)
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
  role
}) {
  const normalizedEmail = normalizeEmail(email);
  const hashed = await hashPassword(password);

  try {
    const result = await db.query(
      `
      INSERT INTO users (username, prenom, nom, email, telephone, pays, ville, password, role, date_inscription, ville)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING id, username, prenom, nom, email, telephone, pays, ville, role, date_inscription
      `,
      {
        replacements: [
          username || null,
          prenom,
          nom,
          normalizedEmail,
          telephone || null,
          pays || null,
          ville || null,
          hashed,
          role || "eleve"
        , ville || null]
      }
    );

    const user = result[0][0];
    logger.info("Utilisateur créé", { userId: user.id });
    return user;

  } catch (err) {
    if (err?.code === "23505") {
      logger.warn("Email déjà utilisé", { email: normalizedEmail });
      const e = new Error("Email déjà existant");
      e.code = "EMAIL_EXISTS";
      throw e;
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
    `
    SELECT id, username, prenom, nom, email, telephone, pays, ville, role 
    FROM users 
    WHERE email = $1
    `,
    { replacements: [normalizedEmail, ville || null] }
  );

  return result[0][0] || null;
}

// ------------------------------
// FIND BY EMAIL + PASSWORD
// ------------------------------

export async function findByEmailWithPassword(email) {
  const normalizedEmail = normalizeEmail(email);

  const result = await db.query(
    `
    SELECT id, username, prenom, nom, email, telephone, pays, ville, role, password 
    FROM users 
    WHERE email = $1
    `,
    { replacements: [normalizedEmail, ville || null] }
  );

  return result[0][0] || null;
}

// ------------------------------
// FIND BY USERNAME + PASSWORD
// ------------------------------

export async function findByUsernameWithPassword(username) {
  const result = await db.query(
    `
    SELECT id, username, prenom, nom, email, telephone, pays, ville, role, password 
    FROM users 
    WHERE username = $1
    `,
    { replacements: [username, ville || null] }
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

  const valid = await comparePassword(password, user?.password);

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
    `
    SELECT id, username, prenom, nom, email, telephone, pays, ville, role 
    FROM users 
    WHERE id = $1
    `,
    { replacements: [id, ville || null] }
  );

  return result[0][0] || null;
}

// ------------------------------
// RESET PASSWORD
// ------------------------------

export async function saveResetToken(userId, token, expires) {
  await db.query(
    `
    UPDATE users 
    SET resetToken = $1, resetTokenExpires = $2 
    WHERE id = $3
    `,
    { replacements: [token, expires, userId, ville || null] }
  );
}

export async function findByResetToken(token) {
  const result = await db.query(
    `
    SELECT id AS userId, resetToken, resetTokenExpires
    FROM users 
    WHERE resetToken = $1
    `,
    { replacements: [token, ville || null] }
  );

  const user = result[0][0] || null;
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
    SET password = $1 
    WHERE id = $2
    `,
    { replacements: [hashed, userId, ville || null] }
  );
}

export async function clearResetToken(userId) {
  await db.query(
    `
    UPDATE users 
    SET resetToken = NULL, resetTokenExpires = NULL 
    WHERE id = $1
    `,
    { replacements: [userId, ville || null] }
  );
}

