// =======================================================
// WS/APPEL/APPEL.ROUTES.JS
// Responsabilité UNIQUE : Mapper les messages aux handlers du controller
// =======================================================

import { logWarning, logError, logSuccess } from '../utils.js';

/**
 * Mapping des types de messages aux noms des handlers du controller
 * Format: messageType -> handlerName
 *
 * ✅ IMPORTANT: Les noms DOIVENT correspondre exactement aux méthodes du controller
 */
export const appelRoutes = {
  'callProfessor': 'handleCallProfessor',
  'acceptCall': 'handleAcceptCall',
  'rejectCall': 'handleRejectCall',
  'cancelCall': 'handleCancelCall',
  'endCall': 'handleEndCall',
  'endSession': 'handleEndSession'
};

/**
 * Router un message vers le bon handler du controller
 *
 * @param {AppelController} controller - Instance du controller
 * @param {WebSocket} ws - La WebSocket
 * @param {Object} data - Le message reçu
 * @returns {boolean} true si le message a été routé, false sinon
 *
 * @throws {Error} Si le handler n'existe pas ou erreur d'exécution
 */
export function routeAppelMessage(controller, ws, data) {
  // ✅ Valider les paramètres
  if (!controller) {
    throw new Error('Controller est requis');
  }

  if (!ws) {
    throw new Error('WebSocket est requise');
  }

  if (!data) {
    throw new Error('Data est requise');
  }

  const messageType = data.type;
  const handlerName = appelRoutes[messageType];

  // ✅ Vérifier que le type de message est enregistré
  if (!handlerName) {
    logWarning('Routes Appel', `Route non trouvée pour: ${messageType}`);
    return false;
  }

  // ✅ Vérifier que le handler existe dans le controller
  const handler = controller[handlerName];

  if (!handler) {
    logError('Routes Appel', `Handler ${handlerName} non trouvé dans le controller`);
    throw new Error(`Handler ${handlerName} n'existe pas dans le controller`);
  }

  if (typeof handler !== 'function') {
    logError('Routes Appel', `${handlerName} n'est pas une fonction`);
    throw new Error(`${handlerName} n'est pas une fonction`);
  }

  // ✅ Exécuter le handler avec le bon contexte (this = controller)
  try {
    logSuccess('Routes Appel', `Appel de ${handlerName}()`);

    // ✅ IMPORTANT: Utiliser .call() pour garder le contexte 'this' du controller
    handler.call(controller, ws, data);

    logSuccess('Routes Appel', `${handlerName}() exécuté avec succès`);

    return true;

  } catch (err) {
    logError('Routes Appel', err);
    throw new Error(`Erreur exécution ${handlerName}(): ${err.message}`);
  }
}

/**
 * Obtenir la liste de tous les types de messages supportés
 *
 * @returns {Array<string>} Liste des types de messages
 */
export function getSupportedMessageTypes() {
  return Object.keys(appelRoutes);
}

/**
 * Obtenir la liste de tous les handlers supportés
 *
 * @returns {Array<string>} Liste des noms des handlers
 */
export function getSupportedHandlers() {
  return Object.values(appelRoutes);
}

/**
 * Vérifier si un type de message est supporté
 *
 * @param {string} messageType - Le type de message à vérifier
 * @returns {boolean} true si le message est supporté
 */
export function isSupportedMessage(messageType) {
  return messageType in appelRoutes;
}

/**
 * Obtenir le nom du handler pour un type de message
 *
 * @param {string} messageType - Le type de message
 * @returns {string|null} Le nom du handler, ou null si non trouvé
 */
export function getHandlerName(messageType) {
  return appelRoutes[messageType] || null;
}

/**
 * Valider qu'un controller a tous les handlers requis
 *
 * @param {AppelController} controller - Le controller à valider
 * @returns {Object} { valid: boolean, missing: Array<string> }
 */
export function validateController(controller) {
  if (!controller) {
    return {
      valid: false,
      missing: Object.values(appelRoutes),
      error: 'Controller est null/undefined'
    };
  }

  const missing = [];

  for (const handlerName of Object.values(appelRoutes)) {
    if (!controller[handlerName] || typeof controller[handlerName] !== 'function') {
      missing.push(handlerName);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    error: missing.length > 0 ? `Handlers manquants: ${missing.join(', ')}` : null
  };
}

/**
 * Ajouter une nouvelle route
 * ⚠️ À utiliser avec prudence - assurer que le handler existe dans le controller
 *
 * @param {string} messageType - Le type de message
 * @param {string} handlerName - Le nom du handler dans le controller
 * @throws {Error} Si le type de message existe déjà
 */
export function addRoute(messageType, handlerName) {
  if (messageType in appelRoutes) {
    throw new Error(`Route ${messageType} existe déjà`);
  }

  if (!handlerName || typeof handlerName !== 'string') {
    throw new Error('handlerName doit être une string non-vide');
  }

  appelRoutes[messageType] = handlerName;
  logSuccess('Routes Appel', `Route ajoutée: ${messageType} → ${handlerName}`);
}

/**
 * Supprimer une route
 * ⚠️ À utiliser avec prudence
 *
 * @param {string} messageType - Le type de message à supprimer
 * @returns {boolean} true si la route a été supprimée
 */
export function removeRoute(messageType) {
  if (messageType in appelRoutes) {
    delete appelRoutes[messageType];
    logSuccess('Routes Appel', `Route supprimée: ${messageType}`);
    return true;
  }
  return false;
}

// =======================================================
// EXPORTS
// =======================================================

export {
  appelRoutes,
  routeAppelMessage,
  getSupportedMessageTypes,
  getSupportedHandlers,
  isSupportedMessage,
  getHandlerName,
  validateController,
  addRoute,
  removeRoute
};
