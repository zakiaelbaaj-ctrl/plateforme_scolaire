// ws/state.js
// Centralisation de l'état global WebSocket (Maps) et helpers légers
import { scheduleTimer, cancelTimer } from "./timerManager.js";

export const clients = new Map(); // username -> Set(ws)
export const connectedProfs = new Map(); // username -> { ws, country, subjects, languages, enAppel, appelAvec }
export const appelsEnAttente = new Map(); // profUsername -> [{ eleve, ... }]
export const appelsEnCours = new Map(); // "prof_eleve" -> { startTime, meta, timerId }

/**
 * Enregistrer une connexion pour un username
 */
export function registerClient(username, ws) {
  if (!username) return;
  const existing = clients.get(username);
  if (!existing) {
    clients.set(username, new Set([ws]));
  } else {
    existing.add(ws);
  }
  ws.username = username;
}

/**
 * Supprimer une connexion pour un username
 */
export function unregisterClient(username, ws) {
  if (!username) return;
  const set = clients.get(username);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) clients.delete(username);

  if (connectedProfs.has(username) && (!clients.has(username) || clients.get(username).size === 0)) {
    connectedProfs.delete(username);
    appelsEnAttente.delete(username);

    // Supprime tous les timers associés à cet utilisateur
    for (const key of appelsEnCours.keys()) {
      if (key.startsWith(username + "_") || key.endsWith("_" + username)) {
        cancelTimer(key);
        appelsEnCours.delete(key);
      }
    }
  }
}

/**
 * Récupérer toutes les connexions d'un username
 */
export function getClientSockets(username) {
  return clients.get(username) || new Set();
}

/**
 * Helpers pour appels
 */
export function addWaitingCall(profUsername, callObj) {
  if (!appelsEnAttente.has(profUsername)) appelsEnAttente.set(profUsername, []);
  appelsEnAttente.get(profUsername).push(callObj);
}

export function shiftWaitingCall(profUsername) {
  if (!appelsEnAttente.has(profUsername)) return null;
  const q = appelsEnAttente.get(profUsername);
  const item = q.shift();
  if (q.length === 0) appelsEnAttente.delete(profUsername);
  return item;
}

/**
 * Démarrer un appel
 */
export function startCall(profUsername, eleveUsername, meta = {}) {
  const key = `${profUsername}_${eleveUsername}`;
  const entry = { startTime: Date.now(), meta, timerId: key };
  appelsEnCours.set(key, entry);

  // Timer automatique pour finir l'appel après 30 minutes
  scheduleTimer(key, 30 * 60 * 1000, () => {
    logger.info(`[state] Call ${key} expired automatically.`);
    endCall(profUsername, eleveUsername);
  });

  return entry;
}

/**
 * Terminer un appel
 */
export function endCall(profUsername, eleveUsername) {
  const key = `${profUsername}_${eleveUsername}`;
  const entry = appelsEnCours.get(key);
  if (entry) {
    cancelTimer(key);
    appelsEnCours.delete(key);
  }
  return entry;
}

