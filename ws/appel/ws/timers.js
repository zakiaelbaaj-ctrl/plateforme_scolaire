// =======================================================
// WS/APPEL/TIMERS.JS — VERSION AMÉLIORÉE & ROBUSTE
// =======================================================

import { logSuccess, logWarning, logError } from '../utils.js';

/**
 * Stockage des timers d'appels
 * Map<callId, Timeout>
 */
export const timers = new Map();

/**
 * Démarrer un timer pour un appel
 * @param {string} callId - ID unique de l'appel
 * @param {Function} callback - Fonction exécutée à expiration
 * @param {number} delayMs - Durée avant expiration (par défaut 60s)
 */
export function startCallTimer(callId, callback, delayMs = 60000) {
  try {
    if (!callId || typeof callId !== 'string') {
      throw new Error(`[AppelTimers] callId invalide: ${callId}`);
    }

    if (typeof callback !== 'function') {
      throw new Error(`[AppelTimers] callback doit être une fonction`);
    }

    // Si un timer existe déjà → le nettoyer avant d'en créer un nouveau
    if (timers.has(callId)) {
      clearTimeout(timers.get(callId));
      logWarning('AppelTimers', `Timer existant remplacé pour: ${callId}`);
    }

    const timeout = setTimeout(() => {
      try {
        callback();
      } catch (err) {
        logError('AppelTimers', `Erreur dans callback du timer ${callId}: ${err.message}`);
      } finally {
        // Toujours nettoyer après exécution
        cleanupCallTimer(callId);
      }
    }, delayMs);

    timers.set(callId, timeout);
    logSuccess('AppelTimers', `Timer démarré pour ${callId} (${delayMs}ms)`);

  } catch (err) {
    logError('AppelTimers', err);
    throw err;
  }
}

/**
 * Nettoyer un timer d'appel
 * @param {string} callId - ID unique de l'appel
 * @returns {boolean} true si un timer a été supprimé
 */
export function cleanupCallTimer(callId) {
  try {
    if (!callId || typeof callId !== 'string') {
      throw new Error(`[AppelTimers] callId invalide: ${callId}`);
    }

    const timeout = timers.get(callId);

    if (!timeout) {
      logWarning('AppelTimers', `Aucun timer trouvé pour: ${callId}`);
      return false;
    }

    clearTimeout(timeout);
    timers.delete(callId);

    logSuccess('AppelTimers', `Timer nettoyé pour ${callId}`);
    return true;

  } catch (err) {
    logError('AppelTimers', err);
    throw err;
  }
}

/**
 * Nettoyer tous les timers (utile lors d'un shutdown serveur)
 * @returns {number} Nombre de timers supprimés
 */
export function cleanupAllTimers() {
  let count = 0;

  for (const [callId, timeout] of timers.entries()) {
    clearTimeout(timeout);
    timers.delete(callId);
    count++;
  }

  logWarning('AppelTimers', `Tous les timers nettoyés (${count})`);
  return count;
}

/**
 * Vérifier si un timer existe
 * @param {string} callId
 * @returns {boolean}
 */
export function hasTimer(callId) {
  return timers.has(callId);
}
