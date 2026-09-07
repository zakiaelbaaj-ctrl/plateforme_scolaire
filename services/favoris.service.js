// services/favoris.service.js
// --------------------------------------------------
// Gestion des professeurs favoris d'un élève (accès DB)
// --------------------------------------------------
import { sequelize as db } from "#config/index.js";
import { QueryTypes } from "sequelize";

/**
 * Retourne la liste des IDs de profs favoris pour un élève donné.
 */
export async function getFavorisByEleve(eleveId) {
  const rows = await db.query(
    `SELECT prof_id FROM eleve_favoris WHERE eleve_id = ?`,
    { replacements: [eleveId], type: QueryTypes.SELECT }
  );
  return rows.map(r => r.prof_id);
}

/**
 * Ajoute un professeur aux favoris d'un élève.
 * Ne fait rien si le favori existe déjà (ON CONFLICT DO NOTHING).
 */
export async function addFavori(eleveId, profId) {
  await db.query(
    `INSERT INTO eleve_favoris (eleve_id, prof_id)
     VALUES (?, ?)
     ON CONFLICT (eleve_id, prof_id) DO NOTHING`,
    { replacements: [eleveId, profId], type: QueryTypes.INSERT }
  );
}

/**
 * Retire un professeur des favoris d'un élève.
 */
export async function removeFavori(eleveId, profId) {
  await db.query(
    `DELETE FROM eleve_favoris WHERE eleve_id = ? AND prof_id = ?`,
    { replacements: [eleveId, profId], type: QueryTypes.DELETE }
  );
}
/**
 * Retourne la liste des IDs d'élèves qui ont ce professeur en favori.
 * Utilisé pour notifier ces élèves quand le prof se connecte.
 */
export async function getElevesByFavoriProf(profId) {
  const rows = await db.query(
    `SELECT eleve_id FROM eleve_favoris WHERE prof_id = ?`,
    { replacements: [profId], type: QueryTypes.SELECT }
  );
  return rows.map(r => r.eleve_id);
}