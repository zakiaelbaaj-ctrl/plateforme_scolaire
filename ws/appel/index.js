// =======================================================
// WS/APPEL/INDEX.JS
// Domaine Appel : initialisation + routing
// =======================================================

import { initAppelDomain } from "./init.js";
import { routeAppelMessage } from "./appel.routes.js";

let appelDomain = null;

/**
 * Initialiser le domaine Appel depuis le handler principal
 * Appelé UNE FOIS au démarrage
 */
export function initAppel(wsContext) {
  appelDomain = initAppelDomain(wsContext);

  if (!appelDomain) {
    throw new Error("❌ initAppelDomain a retourné null");
  }

  console.log("✅ Domaine Appel initialisé");
}

/**
 * Handler pour les messages du domaine Appel
 * Appelé à chaque message WebSocket
 */
export async function handleAppelMessages(ws, data) {
  if (!appelDomain) {
    console.error("❌ Domaine Appel non initialisé");
    return;
  }

  const { controller, routes } = appelDomain;
  const messageType = data.type;

  if (!routes[messageType]) {
    console.warn(`⚠️ Message appel inconnu: ${messageType}`);
    return;
  }

  // Router le message vers la bonne méthode du controller
  return routeAppelMessage(controller, ws, data);
}

/**
 * Obtenir le service Appel
 */
export function getAppelService() {
  if (!appelDomain) {
    throw new Error("Domaine Appel non initialisé");
  }
  return appelDomain.service;
}

/**
 * Obtenir le controller Appel
 */
export function getAppelController() {
  if (!appelDomain) {
    throw new Error("Domaine Appel non initialisé");
  }
  return appelDomain.controller;
}
