// ws/metrics.js
// Module minimal de métriques pour éviter ERR_MODULE_NOT_FOUND.
// Remplace ou étends ces fonctions selon tes besoins (prometheus, db, etc).

/**
 * Initialisation des métriques (appelée depuis ws/index.js si nécessaire)
 * @param {object} opts - options d'initialisation (ex: registry, prefix)
 */
export function initMetrics(opts = {}) {
  // placeholder : initialisation d'un registry ou d'objets de suivi
  // logger.info("metrics initialized", opts);
  return;
}

/**
 * Incrémente un compteur de métrique
 * @param {string} name
 * @param {number} value
 */
export function increment(name, value = 1) {
  // placeholder : incrémenter compteur en mémoire ou envoyer à une DB
  // logger.info(`metrics increment ${name} by ${value}`);
  return;
}

/**
 * Observe une valeur (histogram/gauge)
 * @param {string} name
 * @param {number} value
 */
export function observe(name, value) {
  // placeholder : observer une valeur
  // logger.info(`metrics observe ${name} = ${value}`);
  return;
}

/**
 * Récupérer l'état des métriques (optionnel)
 * @returns {object}
 */
export function getMetricsSnapshot() {
  // retourne un snapshot minimal
  return { uptime: process.uptime(), timestamp: Date.now() };
}

// export par défaut si ws/index.js importe default
export default {
  initMetrics,
  increment,
  observe,
  getMetricsSnapshot
};

