// services/elevesService.js
// --------------------------------------------------
// Version moderne : les élèves = table USERS (role = 'eleve')
// --------------------------------------------------

import { sequelize } from "#config/db.js";
import { QueryTypes } from "sequelize";
import logger from "#config/logger.js";

// --------------------------------------------------
// LISTE DES ÉLÈVES
// --------------------------------------------------

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
        u.subscription_status,
        u.plan_type,
        u.free_trial_start,
        u.free_trial_end,
        u.pays,
        u.date_inscription,
        u.classe,
        u.niveau,
        u.date_naissance,
        u.parent_nom,
        u.photo_url
      FROM users u
      WHERE u.role = 'eleve'
    `;

    const params = {};

    if (q) {
      query += ` AND (u.nom ILIKE :q OR u.prenom ILIKE :q OR u.email ILIKE :q)`;
      params.q = `%${q}%`;
    }

    query += ` ORDER BY u.nom ASC LIMIT :limit OFFSET :offset`;

    const rows = await sequelize.query(query, {
      replacements: { ...params, limit, offset },
      type: QueryTypes.SELECT,
    });

    return { rows, count: rows.length };
  } catch (err) {
    logger.error("❌ findAll failed", err);
    throw err;
  }
}

// --------------------------------------------------
// DÉTAIL D’UN ÉLÈVE
// --------------------------------------------------

export async function findById(userId) {
  try {
    const [eleve] = await sequelize.query(
      `
      SELECT 
        u.id,
        u.prenom,
        u.nom,
        u.email,
        u.telephone,
        u.role,
        u.statut,
        u.subscription_status,
        u.plan_type,
        u.free_trial_start,
        u.free_trial_end,
        u.pays,
        u.date_inscription,
        u.classe,
        u.niveau,
        u.date_naissance,
        u.parent_nom,
        u.photo_url
      FROM users u
      WHERE u.id = :userId AND u.role = 'eleve'
      LIMIT 1
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      }
    );

    return eleve || null;
  } catch (err) {
    logger.error("❌ findById failed", err);
    throw err;
  }
}

// --------------------------------------------------
// CRÉATION D’UN ÉLÈVE
// --------------------------------------------------

export async function createEleve(data) {
  const {
    nom,
    prenom,
    email,
    telephone = null,
    pays = null,
    classe = null,
    niveau = null,
    date_naissance = null,
    parent_nom = null,
    photo_url = null
  } = data;

  try {
    const [created] = await sequelize.query(
      `
      INSERT INTO users (
        nom, prenom, email, telephone, pays,
        classe, niveau, date_naissance, parent_nom, photo_url,
        role, statut, date_inscription
      , ville, ville)
      VALUES (
        :nom, :prenom, :email, :telephone, :pays,
        :classe, :niveau, :date_naissance, :parent_nom, :photo_url,
        'eleve', 'active', NOW()
      )
      RETURNING *
      `,
      {
        replacements: {
          nom,
          prenom,
          email,
          telephone,
          pays,
          classe,
          niveau,
          date_naissance,
          parent_nom,
          photo_url
        },
        type: QueryTypes.INSERT,
      }
    );

    return created || null;
  } catch (err) {
    logger.error("❌ createEleve failed", err);
    throw err;
  }
}

// --------------------------------------------------
// MISE À JOUR D’UN ÉLÈVE
// --------------------------------------------------

export async function updateEleve(userId, data) {
  const {
    nom,
    prenom,
    email,
    telephone,
    pays,
    classe,
    niveau,
    date_naissance,
    parent_nom,
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
        classe = COALESCE(:classe, classe),
        niveau = COALESCE(:niveau, niveau),
        date_naissance = COALESCE(:date_naissance, date_naissance),
        parent_nom = COALESCE(:parent_nom, parent_nom),
        photo_url = COALESCE(:photo_url, photo_url),
        updated_at = NOW()
      WHERE id = :userId AND role = 'eleve'
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
          classe,
          niveau,
          date_naissance,
          parent_nom,
          photo_url
        },
        type: QueryTypes.UPDATE,
      }
    );

    return updated || null;
  } catch (err) {
    logger.error("❌ updateEleve failed", err);
    throw err;
  }
}

// --------------------------------------------------
// SUPPRESSION D’UN ÉLÈVE
// --------------------------------------------------

export async function deleteById(userId) {
  try {
    const [deleted] = await sequelize.query(
      `
      DELETE FROM users
      WHERE id = :userId AND role = 'eleve'
      RETURNING *
      `,
      {
        replacements: { userId },
        type: QueryTypes.DELETE,
      }
    );

    return deleted || null;
  } catch (err) {
    logger.error("❌ deleteById failed", err);
    throw err;
  }
}

// --------------------------------------------------
// HISTORIQUE JOURNALIER
// --------------------------------------------------

export async function findHistoriqueById(userId) {
  try {
    const historique = await sequelize.query(
      `
      SELECT date, heures
      FROM eleve_daily_hours
      WHERE user_id = :userId
      ORDER BY date DESC
      `,
      {
        replacements: { userId },
        type: QueryTypes.SELECT,
      }
    );

    return historique || [];
  } catch (err) {
    logger.error("❌ findHistoriqueById failed", err);
    throw err;
  }
}

// --------------------------------------------------
// HEURES DU MOIS COURANT
// --------------------------------------------------

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
        u.subscription_status,
        u.plan_type,
        u.free_trial_start,
        u.free_trial_end,
        u.pays,
        u.date_inscription,
        u.classe,
        u.niveau,
        u.date_naissance,
        u.parent_nom,
        u.photo_url,
        COALESCE(h.total_heures, 0) AS heures_contact
      FROM users u
      LEFT JOIN (
        SELECT user_id, SUM(duree_minutes)/60.0 AS total_heures
        FROM eleve_monthly_hours
        WHERE annee = EXTRACT(YEAR FROM CURRENT_DATE)
          AND mois = EXTRACT(MONTH FROM CURRENT_DATE)
        GROUP BY user_id
      ) h ON h.user_id = u.id
      WHERE u.role = 'eleve'
    `;

    const params = {};

    if (q) {
      query += ` AND (u.nom ILIKE :q OR u.prenom ILIKE :q OR u.email ILIKE :q)`;
      params.q = `%${q}%`;
    }

    query += ` ORDER BY u.nom ASC LIMIT :limit OFFSET :offset`;

    const rows = await sequelize.query(query, {
      replacements: { ...params, limit, offset },
      type: QueryTypes.SELECT,
    });

    return rows;
  } catch (err) {
    logger.error("❌ findAllWithHeures failed", err);
    throw err;
  }
}


