// ws/timerManager.js
// Scheduler global unique pour tous les timers WS (appels, timeouts, etc.)

/**
 * @typedef {Object} TimerEntry
 * @property {number} expiresAt - timestamp (ms)
 * @property {Function} callback - fonction à exécuter à expiration
 */

const timers = new Map(); // timerId -> TimerEntry
let scheduler = null;

/**
 * Planifie un timer.
 * @param {string} timerId
 * @param {number} delayMs
 * @param {Function} callback
 */
export function scheduleTimer(timerId, delayMs, callback) {
  if (!timerId || typeof callback !== 'function') {
    throw new Error('scheduleTimer: invalid arguments');
  }

  if (timers.has(timerId)) {
    console.warn(`[timerManager] Timer "${timerId}" already exists, overwriting`);
  }

  timers.set(timerId, {
    expiresAt: Date.now() + delayMs,
    callback,
  });
}

/**
 * Annule un timer existant.
 * @param {string} timerId
 */
export function cancelTimer(timerId) {
  timers.delete(timerId);
}

/**
 * Reprogramme un timer existant sans changer le callback.
 * @param {string} timerId
 * @param {number} delayMs
 */
export function rescheduleTimer(timerId, delayMs) {
  const entry = timers.get(timerId);
  if (!entry) return;

  entry.expiresAt = Date.now() + delayMs;
}

/**
 * Tick unique du scheduler (appelé par setInterval).
 * Exécute les timers expirés.
 */
export function processTimersOnce() {
  if (timers.size === 0) return;

  const now = Date.now();

  for (const [id, entry] of timers) {
    if (entry.expiresAt > now) continue;

    try {
      entry.callback();
    } catch (err) {
      console.error(`[timerManager] Timer "${id}" callback error`, err);
    } finally {
      timers.delete(id);
    }
  }
}

/**
 * Démarre le scheduler global.
 * Doit être appelé une seule fois au bootstrap WS.
 * @param {number} intervalMs
 */
export function startTimerScheduler(intervalMs = 1000) {
  if (scheduler) return;

  scheduler = setInterval(processTimersOnce, intervalMs);
}

/**
 * Arrête proprement le scheduler.
 * Utile pour les tests ou le shutdown serveur.
 */
export function stopTimerScheduler() {
  if (!scheduler) return;

  clearInterval(scheduler);
  scheduler = null;
  timers.clear();
}

/**
 * Métriques simples (debug / monitoring).
 */
export function getTimerCount() {
  return timers.size;
}
