// services/prof.service.js
// --------------------------------------------------
// Version moderne : les professeurs = table USERS (role = 'prof')
// --------------------------------------------------

import { sequelize } from "#config/db.js";
import { QueryTypes } from "sequelize";
import logger from "#config/logger.js";

/**
 * Liste paginée / filtrée des professeurs
 */
export async function findAll({ q = null, limit = 50, offset = 0 }) {
  try {
    let query = `
      SELECT 
        u.id,
        u.prenom,
        u.nom,
        u.email,
        u.telephone,
        u.role,
        u.statut,
        u.pays,
        u.date_inscription,
        u.matiere,
        u.bio,
        u.tarif_horaire,
        u.disponibilites,
        u.photo_url
      FROM users u
      WHERE u.role = 'prof'
    `;

    const params = {};

    if (q) {
      query += ` AND (u.nom ILIKE :q OR u.prenom ILIKE :q OR u.email ILIKE :q OR u.matiere ILIKE :q)`;
      params.q = `%${q}%`;
    }

    query += ` ORDER BY u.nom ASC LIMIT :limit OFFSET :offset`;

    const rows = await sequelize.query(query, {
      replacements: { ...params, limit, offset },
      type: QueryTypes.SELECT,
    });

    return { rows, count: rows.length };
  } catch (err) {
    logger.error("❌ findAll profs failed", { message: err.message });
    throw err;
  }
}

/**
 * Récupérer un professeur par ID
 */
export async function findById(userId) {
  try {
    const [prof] = await sequelize.query(
      `
      SELECT 
        u.id,
        u.prenom,
        u.nom,
        u.email,
        u.telephone,
        u.role,
        u.statut,
        u.pays,
        u.date_inscription,
        u.matiere,
        u.bio,
        u.tarif_horaire,
        u.disponibilites,
        u.photo_url
      FROM users u
      WHERE u.id = :userId AND u.role = 'prof'
      LIMIT 1
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      }
    );

    return prof || null;
  } catch (err) {
    logger.error("❌ findById prof failed", { userId, message: err.message });
    throw err;
  }
}

/**
 * Mettre à jour un professeur
 */
export async function updateProf(userId, data) {
  const {
    nom,
    prenom,
    email,
    telephone,
    pays,
    matiere,
    bio,
    tarif_horaire,
    disponibilites,
    photo_url
  } = data;

  try {
    const [updated] = await sequelize.query(
      `
      UPDATE users
      SET
        nom = COALESCE(:nom, nom),
        prenom = COALESCE(:prenom, prenom),
        email = COALESCE(:email, email),
        telephone = COALESCE(:telephone, telephone),
        pays = COALESCE(:pays, pays),
        matiere = COALESCE(:matiere, matiere),
        bio = COALESCE(:bio, bio),
        tarif_horaire = COALESCE(:tarif_horaire, tarif_horaire),
        disponibilites = COALESCE(:disponibilites, disponibilites),
        photo_url = COALESCE(:photo_url, photo_url),
        updated_at = NOW()
      WHERE id = :userId AND role = 'prof'
      RETURNING *
      `,
      {
        replacements: {
          userId,
          nom,
          prenom,
          email,
          telephone,
          pays,
          matiere,
          bio,
          tarif_horaire,
          disponibilites,
          photo_url
        },
        type: QueryTypes.UPDATE,
      }
    );

    return updated || null;
  } catch (err) {
    logger.error("❌ updateProf failed", { userId, message: err.message });
    throw err;
  }
}

/**
 * Supprimer un professeur
 */
export async function deleteById(userId) {
  try {
    const [deleted] = await sequelize.query(
      `
      DELETE FROM users
      WHERE id = :userId AND role = 'prof'
      RETURNING *
      `,
      {
        replacements: { userId },
        type: QueryTypes.DELETE,
      }
    );

    return deleted || null;
  } catch (err) {
    logger.error("❌ deleteProf failed", { userId, message: err.message });
    throw err;
  }
}

/**
 * Heures du mois courant pour tous les professeurs
 */
export async function findAllWithHeures({ q = null, limit = 5000, offset = 0 } = {}) {
  try {
    let query = `
      SELECT 
        u.id,
        u.prenom,
        u.nom,
        u.email,
        u.telephone,
        u.role,
        u.statut,
        u.pays,
        u.date_inscription,
        u.matiere,
        u.bio,
        u.tarif_horaire,
        u.disponibilites,
        u.photo_url,
        COALESCE(h.total_heures, 0) AS heures_contact
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(duree_minutes)/60.0 AS total_heures
        FROM prof_monthly_hours
        WHERE annee = EXTRACT(YEAR FROM CURRENT_DATE)
          AND mois = EXTRACT(MONTH FROM CURRENT_DATE)
        GROUP BY user_id
      ) h ON h.user_id = u.id
      WHERE u.role = 'prof'
    `;

    const params = {};

    if (q) {
      query += ` AND (u.nom ILIKE :q OR u.prenom ILIKE :q OR u.email ILIKE :q OR u.matiere ILIKE :q)`;
      params.q = `%${q}%`;
    }

    query += ` ORDER BY u.nom ASC LIMIT :limit OFFSET :offset`;

    const rows = await sequelize.query(query, {
      replacements: { ...params, limit, offset },
      type: QueryTypes.SELECT,
    });

    return rows;
  } catch (err) {
    logger.error("❌ findAllWithHeures profs failed", { message: err.message });
    throw err;
  }
}
