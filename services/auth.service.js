import bcrypt from "bcryptjs";
import User from "../models/user.model.js"; // Import du modèle Sequelize
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
// CREATE USER (Version Sequelize)
// ------------------------------
export async function createUser(userData) {
  try {
    const normalizedEmail = normalizeEmail(userData.email);
    
    // On laisse le modèle gérer le hachage (via beforeCreate)
    // Seul le statut est géré ici manuellement pour la logique métier
    const isStudent = (userData.role === "eleve" || userData.role === "etudiant");

    const user = await User.create({
      ...userData,
      email: normalizedEmail,
      statut: isStudent ? 'active' : 'pending',
      is_active: isStudent
    });

    logger.info("Utilisateur créé avec succès", { userId: user.id, role: user.role });
    return user.toJSON(); // .toJSON() retire automatiquement le password (voir modèle)

  } catch (err) {
    if (err.name === 'SequelizeUniqueConstraintError') {
      throw new Error("Email ou nom d'utilisateur déjà utilisé");
    }
    logger.error("createUser error:", err);
    throw err;
  }
}

// ------------------------------
// FIND BY EMAIL (Modifié pour fusionner les deux besoins)
// ------------------------------
export async function findByEmail(email, includePassword = false) {
  const normalizedEmail = normalizeEmail(email);
  const options = { where: { email: normalizedEmail } };
  
  if (includePassword) {
    options.attributes = { include: ['password'] };
    return await User.scope(null).findOne(options); // ← bypass defaultScope
  }

  return await User.findOne(options);
}
// ------------------------------
// FIND BY USERNAME (L'emplacement est ICI)
// ------------------------------
export async function findByUsernameWithPassword(username) {
  return await User.scope(null).findOne({  // ← scope(null) bypass le defaultScope
    where: { username }, 
    attributes: { include: ['password'] } 
  });
}
// ------------------------------
// VERIFY CREDENTIALS
// ------------------------------
export async function verifyCredentials({ email, username, password }) {
  let user = null;

  if (email) {
    // On passe 'true' pour récupérer le password nécessaire à la comparaison
    user = await findByEmail(email, true);
  } else if (username) {
    user = await User.findOne({ 
      where: { username }, 
      attributes: { include: ['password'] } 
    });
  }

  if (!user) return null;

  // services/auth.service.js

// ... à la fin de verifyCredentials
  const valid = await comparePassword(password, user.password);

  if (!valid) {
    logger.warn("Invalid credentials", { email, username });
    return null;
  }

  // ✅ Utilise .get({ plain: true }) pour transformer l'instance Sequelize 
  // en un objet simple que ton contrôleur comprendra.
  const userSafe = user.get({ plain: true });
  delete userSafe.password; 
  
  return userSafe;
}

// ------------------------------
// FIND BY ID
// ------------------------------
export async function findById(id) {
  const user = await User.findByPk(id);
  return user ? user.toJSON() : null;
}

// ------------------------------
// RESET PASSWORD FUNCTIONS
// ------------------------------
export async function saveResetToken(userId, token) {
  const expires = new Date(Date.now() + 3600000); // +1 heure
  
  await User.update(
    { resetToken: token, resetTokenExpires: expires },
    { where: { id: userId } }
  );
}

export async function findByResetToken(token) {
  const user = await User.findOne({
    where: { resetToken: token }
  });

  if (!user || (user.resetTokenExpires && new Date(user.resetTokenExpires) < new Date())) {
    return null;
  }
  
  return user;
}

export async function updatePassword(userId, newPassword) {
  // Le hachage sera fait automatiquement par le hook 'beforeUpdate' du modèle
  const user = await User.findByPk(userId);
  if (user) {
    user.password = newPassword;
    await user.save();
  }
}

export async function clearResetToken(userId) {
  await User.update(
    { resetToken: null, resetTokenExpires: null },
    { where: { id: userId } }
  );
}
