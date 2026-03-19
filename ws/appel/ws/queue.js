// =======================================================
// WS/APPEL/QUEUE.JS — VERSION FINALE CORRIGÉE
// =======================================================

import { logSuccess, logWarning, logError } from '../utils.js';

/**
 * Classe représentant une queue d'appels en attente.
 * Stockage : Map<appelId, appelObject>
 */
export class AppelQueue {
  constructor() {
    this.queue = new Map();
  }

  /**
   * Ajouter un appel complet à la queue
   * @param {Object} appel - { id, eleveId, profId, createdAt, expiresAt }
   * @throws {Error} Si l'appel est invalide
   */
  add(appel) {
    try {
      // ✅ FIX: new Error(...) avec parenthèses
      if (!appel || typeof appel !== 'object') {
        throw new Error(`[AppelQueue] Appel invalide (non-objet): ${appel}`);
      }

      if (!appel.id || typeof appel.id !== 'string') {
        throw new Error(`[AppelQueue] Appel invalide: id manquant ou non-string`);
      }

      // ✅ Vérifier qu'il n'existe pas déjà
      if (this.queue.has(appel.id)) {
        logWarning('AppelQueue', `Appel déjà dans la queue: ${appel.id}`);
        return;
      }

      this.queue.set(appel.id, appel);
      logSuccess('AppelQueue', `Appel ajouté: ${appel.id}`);

    } catch (err) {
      logError('AppelQueue', err);
      throw err;
    }
  }

  /**
   * Retirer un appel de la queue
   * @param {string} appelId - L'ID de l'appel à retirer
   * @returns {boolean} true si l'appel existait et a été supprimé
   * @throws {Error} Si appelId est invalide
   */
  remove(appelId) {
    try {
      // ✅ FIX: new Error(...) avec parenthèses
      if (!appelId || typeof appelId !== 'string') {
        throw new Error(`[AppelQueue] appelId invalide: ${appelId}`);
      }

      const existed = this.queue.delete(appelId);

      if (existed) {
        logSuccess('AppelQueue', `Appel retiré: ${appelId}`);
      } else {
        logWarning('AppelQueue', `Appel non trouvé dans la queue: ${appelId}`);
      }

      return existed;

    } catch (err) {
      logError('AppelQueue', err);
      throw err;
    }
  }

  /**
   * Obtenir un appel par ID
   * @param {string} appelId - L'ID de l'appel
   * @returns {Object|null} L'objet appel ou null si non trouvé
   */
  get(appelId) {
    return this.queue.get(appelId) || null;
  }

  /**
   * Obtenir tous les appels
   * @returns {Array<Object>} Liste des appels
   */
  getAll() {
    return Array.from(this.queue.values());
  }

  /**
   * Vérifier si un appel existe
   * @param {string} appelId - L'ID de l'appel
   * @returns {boolean} true si l'appel existe
   */
  has(appelId) {
    return this.queue.has(appelId);
  }

  /**
   * Nombre d'appels en attente
   * @returns {number} Taille de la queue
   */
  size() {
    return this.queue.size;
  }

  /**
   * Vérifier si la queue est vide
   * @returns {boolean} true si vide
   */
  isEmpty() {
    return this.queue.size === 0;
  }

  /**
   * Vider la queue complètement
   * ⚠️ À utiliser avec prudence
   */
  clear() {
    const size = this.queue.size;
    this.queue.clear();
    logWarning('AppelQueue', `Queue vidée (${size} appels supprimés)`);
  }

  /**
   * Obtenir le premier appel (FIFO)
   * @returns {Object|null} Le premier appel ou null si vide
   */
  peek() {
    const first = this.queue.values().next().value;
    return first || null;
  }

  /**
   * Obtenir les appels expirés
   * @returns {Array<Object>} Liste des appels expirés
   */
  getExpired() {
    const now = Date.now();
    return this.getAll().filter(appel =>
      appel.expiresAt && appel.expiresAt < now
    );
  }

  /**
   * Nettoyer automatiquement les appels expirés
   * Appelé régulièrement par un intervalle
   * @returns {number} Nombre d'appels supprimés
   */
  cleanupExpired() {
    const expired = this.getExpired();

    expired.forEach(appel => {
      this.queue.delete(appel.id);
      logWarning('AppelQueue', `Appel expiré supprimé: ${appel.id}`);
    });

    if (expired.length > 0) {
      logSuccess('AppelQueue', `${expired.length} appel(s) expiré(s) supprimé(s)`);
    }

    return expired.length;
  }

  /**
   * Obtenir les appels d'un professeur
   * @param {number} profId - L'ID du professeur
   * @returns {Array<Object>} Liste des appels du prof
   */
  getByProf(profId) {
    return this.getAll().filter(appel => appel.profId === profId);
  }

  /**
   * Obtenir les appels d'un élève
   * @param {number} eleveId - L'ID de l'élève
   * @returns {Array<Object>} Liste des appels de l'élève
   */
  getByEleve(eleveId) {
    return this.getAll().filter(appel => appel.eleveId === eleveId);
  }

  /**
   * Vérifier si un élève a déjà un appel en attente
   * @param {number} eleveId - L'ID de l'élève
   * @returns {boolean} true si l'élève a un appel en attente
   */
  hasEleve(eleveId) {
    return this.getAll().some(appel => appel.eleveId === eleveId);
  }

  /**
   * Vérifier si un prof a des appels en attente
   * @param {number} profId - L'ID du professeur
   * @returns {boolean} true si le prof a des appels
   */
  hasProf(profId) {
    return this.getAll().some(appel => appel.profId === profId);
  }

  /**
   * Obtenir les stats de la queue
   * @returns {Object} { total, expired, byProf, byEleve, isEmpty }
   */
  getStats() {
    const all = this.getAll();
    const expired = this.getExpired();

    const statsByProf = {};
    const statsByEleve = {};

    all.forEach(appel => {
      statsByProf[appel.profId] = (statsByProf[appel.profId] || 0) + 1;
      statsByEleve[appel.eleveId] = (statsByEleve[appel.eleveId] || 0) + 1;
    });

    return {
      total: all.length,
      expired: expired.length,
      byProf: statsByProf,
      byEleve: statsByEleve,
      isEmpty: all.length === 0
    };
  }

  /**
   * Obtenir un résumé texte de la queue
   * @returns {string} Résumé pour les logs
   */
  getSummary() {
    const stats = this.getStats();
    return `Queue: ${stats.total} appels (${stats.expired} expirés)`;
  }
}

// =======================================================
// INSTANCE PAR DÉFAUT (singleton)
// =======================================================

export const appelQueue = new AppelQueue();

// =======================================================
// UTILITAIRES GLOBALES (optionnel)
// =======================================================

/**
 * Ajouter un appel (utilise l'instance par défaut)
 */
export function addAppel(appel) {
  return appelQueue.add(appel);
}

/**
 * Retirer un appel (utilise l'instance par défaut)
 */
export function removeAppel(appelId) {
  return appelQueue.remove(appelId);
}

/**
 * Obtenir tous les appels (utilise l'instance par défaut)
 */
export function getAllAppels() {
  return appelQueue.getAll();
}

/**
 * Obtenir la taille de la queue (utilise l'instance par défaut)
 */
export function getQueueSize() {
  return appelQueue.size();
}

// =======================================================
// INTERVAL DE CLEANUP (À METTRE DANS init.js)
// =======================================================

/**
 * Démarrer le nettoyage automatique des appels expirés
 * À appeler une fois au démarrage
 */
export function startCleanupInterval(intervalMs = 30000) {
  // Nettoyer toutes les 30 secondes
  const intervalId = setInterval(() => {
    const cleaned = appelQueue.cleanupExpired();
    if (cleaned > 0) {
      logSuccess('AppelQueue', `Cleanup: ${cleaned} appel(s) supprimé(s)`);
    }
  }, intervalMs);

  return intervalId; // Pour pouvoir arrêter l'intervalle si besoin
}

/**
 * Arrêter le nettoyage automatique
 */
export function stopCleanupInterval(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    logSuccess('AppelQueue', 'Cleanup interval arrêté');
  }
}

// =======================================================
// EXPORTS
// =======================================================

export {
  AppelQueue,
  appelQueue,
  addAppel,
  removeAppel,
  getAllAppels,
  getQueueSize,
  startCleanupInterval,
  stopCleanupInterval
};
