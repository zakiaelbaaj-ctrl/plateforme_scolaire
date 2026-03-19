// =======================================================
// WS/APPEL/INIT.JS
// Responsabilité UNIQUE : Initialiser et injecter les dépendances
// =======================================================

import { AppelService } from './appel.service.js';
import { AppelController } from './appel.controller.js';
import { appelRoutes } from './appel.routes.js';
import { logSuccess, logError } from '../utils.js';

/**
 * Initialiser le domaine Appel
 * Crée et injecte toutes les dépendances
 *
 * @param {Object} wsContext - Contexte WebSocket partagé
 * @param {Map} wsContext.clients - Map userId -> WebSocket
 * @param {Map} wsContext.onlineProfessors - Map profId -> professeur data
 * @param {Map} wsContext.rooms - Map roomId -> Set<WebSocket>
 *
 * @returns {Object} { service, controller, routes } - ✅ STRUCTURE EXACTE
 *
 * @throws {Error} Si wsContext est invalide
 */
export function initAppelDomain(wsContext) {
  // ✅ Valider les dépendances
  if (!wsContext) {
    throw new Error('wsContext est requis');
  }

  if (!wsContext.clients || !(wsContext.clients instanceof Map)) {
    throw new Error('wsContext.clients doit être une Map');
  }

  if (!wsContext.onlineProfessors || !(wsContext.onlineProfessors instanceof Map)) {
    throw new Error('wsContext.onlineProfessors doit être une Map');
  }

  if (!wsContext.rooms || !(wsContext.rooms instanceof Map)) {
    throw new Error('wsContext.rooms doit être une Map');
  }

  try {
    // ✅ 1. Créer le Service (injecter l'état partagé)
    const service = new AppelService(wsContext.onlineProfessors);

    logSuccess('AppelInit', 'Service créé');

    // ✅ 2. Créer le Controller (injecter le service et le contexte)
    const controller = new AppelController(service, wsContext);

    logSuccess('AppelInit', 'Controller créé');

    // ✅ 3. Préparer les routes
    const routes = { ...appelRoutes };

    logSuccess('AppelInit', `Routes préparées: ${Object.keys(routes).length} routes`);

    // ✅ 4. RETOUR EXACT: { service, controller, routes }
    const domain = {
      service,     // ✅ Instance du service
      controller,  // ✅ Instance du controller
      routes       // ✅ Map des routes
    };

    logSuccess('AppelInit', 'Domaine Appel initialisé avec succès');

    console.log('✅ initAppelDomain retourne:', {
      service: typeof domain.service,
      controller: typeof domain.controller,
      routes: Object.keys(domain.routes)
    });

    return domain;

  } catch (err) {
    logError('AppelInit', err);
    throw new Error(`Erreur initialisation domaine Appel: ${err.message}`);
  }
}

/**
 * Créer une instance du service Appel de manière isolée
 * Utile pour les tests ou utilisation hors contexte WebSocket
 *
 * @param {Map} onlineProfessorsState - État des professeurs en ligne
 * @returns {AppelService}
 */
export function createAppelService(onlineProfessorsState) {
  if (!onlineProfessorsState || !(onlineProfessorsState instanceof Map)) {
    throw new Error('onlineProfessorsState doit être une Map');
  }

  return new AppelService(onlineProfessorsState);
}

/**
 * Créer une instance du controller Appel de manière isolée
 * Utile pour les tests
 *
 * @param {AppelService} appelService - L'instance du service
 * @param {Object} wsContext - Le contexte WebSocket
 * @returns {AppelController}
 */
export function createAppelController(appelService, wsContext) {
  if (!appelService || !(appelService instanceof AppelService)) {
    throw new Error('appelService doit être une instance de AppelService');
  }

  if (!wsContext) {
    throw new Error('wsContext est requis');
  }

  return new AppelController(appelService, wsContext);
}

/**
 * Vérifier qu'un domaine a la bonne structure
 * Utile pour les tests ou validation
 *
 * @param {Object} domain - Le domaine à valider
 * @returns {boolean} true si la structure est correcte
 */
export function isValidDomain(domain) {
  if (!domain) return false;
  if (!domain.service) return false;
  if (!domain.controller) return false;
  if (!domain.routes || typeof domain.routes !== 'object') return false;

  return true;
}

// =======================================================
// EXPORTS
// =======================================================

export {
  initAppelDomain,
  createAppelService,
  createAppelController,
  isValidDomain
};
