// =======================================================
// VÉRIFICATION: WS/APPEL/APPEL.STATE.JS
// =======================================================

/**
 * ✅ POINTS POSITIFS :
 * 
 * 1. Structure claire et bien organisée
 * 2. Séparation pending/active/history
 * 3. Utilise AppelQueue pour la FIFO
 * 4. Logging cohérent
 * 5. JSDoc complet
 * 6. Singleton pattern
 * 
 * ⚠️ PROBLÈMES À CORRIGER :
 * 
 * 1. ❌ Pas de vérification sur activateCall()
 *    - Ne vérifie pas que l'appel est dans pending AVANT d'activer
 *    - Ne retire pas de pending après activation
 * 
 * 2. ❌ Pas de méthode pour GET un appel par prof/élève
 *    - hasActiveForProf() = booléen seulement
 *    - Besoin d'une méthode getActiveForProf()
 * 
 * 3. ❌ Pas de cleanup global
 *    - Appels expirés ne sont jamais nettoyés
 *    - Historique peut devenir énorme
 * 
 * 4. ❌ Pas de vérification d'intégrité
 *    - Un appel peut être dans pending ET active?
 *    - Aucune vérification
 * 
 * 5. ❌ Pas de méthode pour annuler un appel
 *    - Juste pending -> active
 *    - Pas de pending -> removed (annulation)
 * 
 * 6. ❌ nextPending() utilise peek()
 *    - Mais on a pop() maintenant
 *    - Pourrait utiliser pop() pour consommer la queue
 */

// =======================================================
// ✅ VERSION CORRIGÉE
// =======================================================

import { logSuccess, logWarning, logError } from '../utils.js';
import { AppelQueue } from './queue.js';

/**
 * Structure du state :
 * 
 * pendingQueue : Appels en attente (FIFO)
 * activeCalls  : Map<appelId, appelObject>
 * history      : Map<appelId, appelObject> (optionnel)
 * 
 * Un appel = {
 *   id: string,
 *   eleveId: number,
 *   profId: number,
 *   createdAt: number,
 *   expiresAt: number,
 *   acceptedAt?: number,
 *   endedAt?: number,
 *   status?: 'pending' | 'active' | 'ended' | 'cancelled'
 * }
 */

class AppelState {
  constructor() {
    this.pendingQueue = new AppelQueue();     // ✅ Appels en attente
    this.activeCalls = new Map();             // ✅ Appels actifs
    this.history = new Map();                 // ✅ Historique
  }

  // =====================================================
  // PENDING CALLS (EN ATTENTE)
  // =====================================================

  /**
   * Ajouter un appel à la queue en attente
   * @param {Object} appel - L'appel à ajouter
   * @throws {Error} Si l'appel est invalide
   */
  addPending(appel) {
    try {
      // ✅ Vérifier que l'appel n'existe pas déjà
      if (this.pendingQueue.has(appel.id)) {
        logWarning('AppelState', `Appel déjà en attente: ${appel.id}`);
        return false;
      }

      if (this.activeCalls.has(appel.id)) {
        logWarning('AppelState', `Appel déjà actif, impossible d'ajouter en attente: ${appel.id}`);
        return false;
      }

      this.pendingQueue.add(appel);
      logSuccess('AppelState', `Appel ajouté en attente: ${appel.id}`);

      return true;

    } catch (err) {
      logError('AppelState', err);
      throw err;
    }
  }

  /**
   * Retirer un appel de la queue en attente (annulation)
   * @param {string} appelId - L'ID de l'appel
   * @returns {boolean} true si retiré
   */
  removePending(appelId) {
    try {
      const removed = this.pendingQueue.remove(appelId);

      if (removed) {
        logSuccess('AppelState', `Appel annulé (retiré de la file): ${appelId}`);
      } else {
        logWarning('AppelState', `Appel non trouvé en attente: ${appelId}`);
      }

      return removed;

    } catch (err) {
      logError('AppelState', err);
      throw err;
    }
  }

  /**
   * Obtenir un appel en attente
   * @param {string} appelId - L'ID de l'appel
   * @returns {Object|null} L'appel ou null
   */
  getPending(appelId) {
    return this.pendingQueue.get(appelId);
  }

  /**
   * Obtenir tous les appels en attente
   * @returns {Array<Object>} Liste des appels
   */
  getAllPending() {
    return this.pendingQueue.getAll();
  }

  /**
   * Vérifier si un élève a un appel en attente
   * @param {number} eleveId - L'ID de l'élève
   * @returns {boolean}
   */
  hasPendingForEleve(eleveId) {
    return this.pendingQueue.hasEleve(eleveId);
  }

  /**
   * Obtenir les appels en attente pour un élève
   * @param {number} eleveId - L'ID de l'élève
   * @returns {Array<Object>} Liste des appels
   */
  getPendingForEleve(eleveId) {
    return this.pendingQueue.getByEleve(eleveId);
  }

  /**
   * Vérifier si un prof a des appels en attente
   * @param {number} profId - L'ID du professeur
   * @returns {boolean}
   */
  hasPendingForProf(profId) {
    return this.pendingQueue.hasProf(profId);
  }

  /**
   * Obtenir les appels en attente pour un prof
   * @param {number} profId - L'ID du professeur
   * @returns {Array<Object>} Liste des appels
   */
  getPendingForProf(profId) {
    return this.pendingQueue.getByProf(profId);
  }

  /**
   * Obtenir le prochain appel en attente (FIFO) SANS le supprimer
   * @returns {Object|null} Le premier appel ou null
   */
  nextPending() {
    return this.pendingQueue.peek();
  }

  /**
   * ✅ NOUVEAU: Consommer le prochain appel (FIFO + suppression)
   * Utile pour un worker/cron qui traite les appels
   * @returns {Object|null} Le premier appel supprimé de la queue
   */
  popNextPending() {
    return this.pendingQueue.pop();
  }

  /**
   * Nettoyer les appels expirés en attente
   * @returns {number} Nombre d'appels supprimés
   */
  cleanupExpiredPending() {
    return this.pendingQueue.cleanupExpired();
  }

  // =====================================================
  // ACTIVE CALLS (APPELS ACCEPTÉS)
  // =====================================================

  /**
   * Activer un appel (passer de pending à active)
   * ✅ Corrigé: retire de pending ET ajoute en active
   * @param {Object} appel - L'appel à activer
   * @returns {boolean} true si activé
   * @throws {Error} Si l'appel est invalide
   */
  activateCall(appel) {
    try {
      // ✅ Valider l'appel
      if (!appel || !appel.id) {
        throw new Error(`[AppelState] Appel invalide pour activation`);
      }

      // ✅ Vérifier qu'il est en attente
      if (!this.pendingQueue.has(appel.id)) {
        logWarning('AppelState', `Appel non trouvé en attente: ${appel.id}`);
        return false;
      }

      // ✅ Retirer de pending
      this.pendingQueue.remove(appel.id);

      // ✅ Ajouter en active
      appel.acceptedAt = Date.now();
      appel.status = 'active';
      this.activeCalls.set(appel.id, appel);

      logSuccess('AppelState', `Appel activé: ${appel.id}`);

      return true;

    } catch (err) {
      logError('AppelState', err);
      throw err;
    }
  }

  /**
   * Terminer un appel actif
   * @param {string} appelId - L'ID de l'appel
   * @returns {boolean} true si terminé
   */
  endCall(appelId) {
    try {
      const appel = this.activeCalls.get(appelId);

      if (!appel) {
        logWarning('AppelState', `Appel actif non trouvé: ${appelId}`);
        return false;
      }

      // ✅ Marquer comme terminé
      appel.endedAt = Date.now();
      appel.status = 'ended';

      // ✅ Déplacer dans l'historique
      this.history.set(appelId, appel);

      // ✅ Retirer des appels actifs
      this.activeCalls.delete(appelId);

      logSuccess('AppelState', `Appel terminé: ${appelId}`);

      return true;

    } catch (err) {
      logError('AppelState', err);
      throw err;
    }
  }

  /**
   * Obtenir un appel actif
   * @param {string} appelId - L'ID de l'appel
   * @returns {Object|null} L'appel ou null
   */
  getActive(appelId) {
    return this.activeCalls.get(appelId) || null;
  }

  /**
   * Obtenir tous les appels actifs
   * @returns {Array<Object>} Liste des appels
   */
  getAllActive() {
    return Array.from(this.activeCalls.values());
  }

  /**
   * Vérifier si un élève a un appel actif
   * @param {number} eleveId - L'ID de l'élève
   * @returns {boolean}
   */
  hasActiveForEleve(eleveId) {
    return this.getAllActive().some(a => a.eleveId === eleveId);
  }

  /**
   * ✅ NOUVEAU: Obtenir l'appel actif d'un élève
   * @param {number} eleveId - L'ID de l'élève
   * @returns {Object|null} L'appel actif ou null
   */
  getActiveForEleve(eleveId) {
    return this.getAllActive().find(a => a.eleveId === eleveId) || null;
  }

  /**
   * Vérifier si un prof a un appel actif
   * @param {number} profId - L'ID du professeur
   * @returns {boolean}
   */
  hasActiveForProf(profId) {
    return this.getAllActive().some(a => a.profId === profId);
  }

  /**
   * ✅ NOUVEAU: Obtenir l'appel actif d'un prof
   * @param {number} profId - L'ID du professeur
   * @returns {Object|null} L'appel actif ou null
   */
  getActiveForProf(profId) {
    return this.getAllActive().find(a => a.profId === profId) || null;
  }

  /**
   * ✅ NOUVEAU: Mettre à jour un appel actif
   * @param {string} appelId - L'ID de l'appel
   * @param {Object} partial - Propriétés à fusionner
   * @returns {boolean} true si mis à jour
   */
  updateActive(appelId, partial) {
    try {
      const appel = this.activeCalls.get(appelId);

      if (!appel) {
        logWarning('AppelState', `Appel actif non trouvé pour update: ${appelId}`);
        return false;
      }

      // ✅ Fusionner
      const updated = { ...appel, ...partial };

      // ✅ Sauvegarder
      this.activeCalls.set(appelId, updated);

      logSuccess('AppelState', `Appel actif mis à jour: ${appelId}`);

      return true;

    } catch (err) {
      logError('AppelState', err);
      throw err;
    }
  }

  // =====================================================
  // HISTORY (OPTIONNEL)
  // =====================================================

  /**
   * Obtenir un appel de l'historique
   * @param {string} appelId - L'ID de l'appel
   * @returns {Object|null} L'appel ou null
   */
  getHistory(appelId) {
    return this.history.get(appelId) || null;
  }

  /**
   * Obtenir tout l'historique
   * @returns {Array<Object>} Liste des appels terminés
   */
  getAllHistory() {
    return Array.from(this.history.values());
  }

  /**
   * ✅ NOUVEAU: Nettoyer l'historique (limiter la taille)
   * Garder seulement les 1000 derniers appels
   * @returns {number} Nombre d'appels supprimés
   */
  cleanupHistory(maxSize = 1000) {
    const size = this.history.size;

    if (size > maxSize) {
      const toDelete = size - maxSize;
      const entries = Array.from(this.history.entries());

      for (let i = 0; i < toDelete; i++) {
        this.history.delete(entries[i][0]);
      }

      logWarning('AppelState', `Historique nettoyé: ${toDelete} appels supprimés`);

      return toDelete;
    }

    return 0;
  }

  /**
   * ✅ NOUVEAU: Exporter l'historique (pour analytics)
   * @returns {Array<Object>} Historique formaté
   */
  exportHistory() {
    return this.getAllHistory().map(appel => ({
      id: appel.id,
      eleveId: appel.eleveId,
      profId: appel.profId,
      duration: (appel.endedAt - appel.createdAt) / 1000, // en secondes
      durationFormatted: this._formatDuration((appel.endedAt - appel.createdAt) / 1000),
      createdAt: new Date(appel.createdAt).toISOString(),
      acceptedAt: appel.acceptedAt ? new Date(appel.acceptedAt).toISOString() : null,
      endedAt: appel.endedAt ? new Date(appel.endedAt).toISOString() : null
    }));
  }

  // =====================================================
  // STATS & MONITORING
  // =====================================================

  /**
   * Obtenir les stats du state
   * @returns {Object} Stats complètes
   */
  getStats() {
    return {
      pending: this.pendingQueue.size(),
      active: this.activeCalls.size,
      history: this.history.size,
      expiredPending: this.pendingQueue.getExpired().length,
      oldestPending: this.nextPending() ? new Date(this.nextPending().createdAt).toISOString() : null
    };
  }

  /**
   * Obtenir un résumé texte
   * @returns {string} Résumé pour les logs
   */
  getSummary() {
    const s = this.getStats();
    return `[AppelState] Pending: ${s.pending}, Active: ${s.active}, History: ${s.history}, Expired: ${s.expiredPending}`;
  }

  /**
   * ✅ NOUVEAU: Cleanup global
   * Appelé périodiquement pour nettoyer tout
   */
  cleanup() {
    const expiredCount = this.cleanupExpiredPending();
    const historyCount = this.cleanupHistory();

    logSuccess('AppelState', `Cleanup: ${expiredCount} pending expirés, ${historyCount} history supprimés`);

    return {
      expiredPending: expiredCount,
      cleanedHistory: historyCount
    };
  }

  /**
   * ✅ NOUVEAU: Vérifier l'intégrité du state
   * @returns {Object} { isValid, errors }
   */
  validate() {
    const errors = [];

    // Vérifier qu'aucun appel n'est dans 2 états
    const pendingIds = new Set(this.getAllPending().map(a => a.id));
    const activeIds = new Set(this.getAllActive().map(a => a.id));
    const historyIds = new Set(this.getAllHistory().map(a => a.id));

    for (const id of pendingIds) {
      if (activeIds.has(id)) {
        errors.push(`Appel ${id} est dans pending ET active`);
      }
      if (historyIds.has(id)) {
        errors.push(`Appel ${id} est dans pending ET history`);
      }
    }

    for (const id of activeIds) {
      if (historyIds.has(id)) {
        errors.push(`Appel ${id} est dans active ET history`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Utilitaire: Formatter la durée
   * @private
   */
  _formatDuration(seconds) {
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}m ${secs}s`;
  }
}

// =======================================================
// SINGLETON GLOBAL
// =======================================================

export const appelState = new AppelState();

// =======================================================
// EXPORTS
// =======================================================

export { AppelState, appelState };
