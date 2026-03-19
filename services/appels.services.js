// services/appelsService.js

import AppelModel from "#models/AppelModel.js";

/**
 * Récupérer tous les appels en attente pour un professeur
 * @param {string} profUsername - le username du professeur
 * @returns {Promise<Array>}
 */
export async function getAppelsEnAttente(profUsername) {
  try {
    const appels = await AppelModel.findAll({
      where: {
        prof_username: profUsername,
        statut: "en_attente"  // colonne existante dans la table
      },
      order: [["start_time", "ASC"]] // on trie par date de début
    });

    return appels;
  } catch (err) {
    console.error("❌ getAppelsEnAttente error:", err);
    throw err;
  }
}
