// =======================================================
// WS/HANDLER.JS – Routeur Principal avec Sécurité Renforcée
// =======================================================

import {
  validateMessage,
  safeSend,
  RateLimiter,
  logWarning,
  logError,
  logSuccess,
  logInfo
} from './utils.js';

// Domaines existants
import { initAppel, handleAppelMessages } from './appel/index.js';
import { initAuth, handleAuthMessages } from './auth/index.js';
import { initChat, handleChatMessages } from './chat/index.js';
import { initFils, handleFilsMessages } from './fils/index.js';
import { initMatieres, handleMatieresMessages } from './matieres/index.js';
import { initSignaling, handleSignalingMessages } from './signaling/index.js';

// Domaine rooms + chat + documents
import { joinRoom, chatMessage, documentShare, leaveRoom } from './rooms.js';

// Domaine tableau blanc + partage écran
import * as Whiteboard from './tableau.js';

import wsContext from './context.js';

// =======================================================
// CONFIGURATION
// =======================================================

const actionLimiter = new RateLimiter(10, 1000);   // appels, actions sensibles
const chatLimiter   = new RateLimiter(30, 1000);   // chat plus tolérant

 // Ne pas rate-limit les flux temps réel intensifs
    const NO_RATE_LIMIT_TYPES = new Set([
  'tableauStroke',
  'tableauSync',
  'offer',
  'answer',
  'iceCandidate',
  'ping'
   ]);

// =======================================================
// ROUTAGE DES MESSAGES
// =======================================================

const DOMAIN_HANDLERS = {
  

  // Domaine Appel
  'callProfessor': 'appel',
  'acceptCall': 'appel',
  'rejectCall': 'appel',
  'cancelCall': 'appel',
  'endCall': 'appel',
  'endSession': 'appel',   // ✅ AJOUT
  // Domaine Chat 
  'joinChat': 'rooms', // ← OBLIGATOIRE 
  'chatMessage': 'rooms',

  // Domaine Auth
  'identify': 'auth',
  'authenticate': 'auth',

  // Domaine Chat (global)
  'chatMessage': 'rooms',
  'userJoined': 'rooms',
  'userLeft': 'rooms',
// Domaine Rooms
'joinRoom': 'rooms',
'joinChat': 'rooms',        // ✅ AJOUT
'documentShare': 'rooms',
'chatMessage': 'rooms',
  // Domaine Fils
  'createThread': 'fils',
  'replyThread': 'fils',

  // Domaine Matieres
  'getMatieres': 'matieres',
  'selectMatiere': 'matieres',

  // Domaine Signaling
  'offer': 'signaling',
  'answer': 'signaling',
  'iceCandidate': 'signaling',

  // Domaine Whiteboard
  'tableauStroke': 'whiteboard',
  'tableauSync': 'whiteboard',
  'tableauClear': 'whiteboard',
  'tableauUndo': 'whiteboard',
  'tableauExport': 'whiteboard',
  'screenShareStart': 'whiteboard',
  'screenShareStop': 'whiteboard',

  // Heartbeat
  'ping': 'ping'
};
console.log("DOMAIN_HANDLERS:", DOMAIN_HANDLERS);
console.log("🧭 ROUTES ACTIVES :", Object.keys(DOMAIN_HANDLERS));

// =======================================================
// HANDLERS PAR DOMAINE
// =======================================================

const HANDLERS_BY_DOMAIN = {
  'appel': handleAppelMessages,
  'auth': handleAuthMessages,
  'fils': handleFilsMessages,
  'matieres': handleMatieresMessages,
  'signaling': handleSignalingMessages,

  // Domaine rooms.js
  'rooms': async (ws, data) => {
  switch (data.type) {
    case 'joinRoom':
    case 'joinChat': // ✅ AJOUT
      return joinRoom(ws, data, wsContext.onlineProfessors, wsContext.clients);
    case 'chatMessage':
      return chatMessage(ws, data);
    case 'documentShare':
      return documentShare(ws, data);
  }
},
  // Domaine tableau.js
  'whiteboard': async (ws, data) => {
    // 🔥 Auto-join room si pas encore fait (sécurité whiteboard)
if (data.roomId && ws.roomId !== data.roomId) {
 await joinRoom(ws, { roomId: data.roomId }, wsContext.onlineProfessors, wsContext.clients);
}
    switch (data.type) {
      case 'tableauStroke':
        return Whiteboard.tableauStroke(ws, data);
      case 'tableauSync':
        return Whiteboard.tableauSync(ws, data);
      case 'tableauClear':
        return Whiteboard.tableauClear(ws, data);
      case 'tableauUndo':
        return Whiteboard.tableauUndo(ws, data);
      case 'tableauExport':
        return Whiteboard.tableauExport(ws, data);
      case 'screenShareStart':
        return Whiteboard.screenShareStart(ws, data);
      case 'screenShareStop':
        return Whiteboard.screenShareStop(ws, data);
    }
  },

  'ping': (ws) => {
    safeSend(ws, { type: 'pong', timestamp: new Date().toISOString() });
  }
};

// =======================================================
// INITIALISATION DES DOMAINES
// =======================================================

export function initializeAllDomains() {
  console.log('🚀 Initialisation des domaines WebSocket...');

  try {
    initAppel(wsContext);
    initAuth(wsContext);
    initChat(wsContext);
    initFils(wsContext);
    initMatieres(wsContext);
    initSignaling(wsContext);

    logSuccess('Handler', 'Tous les domaines initialisés');
    console.log(`✅ ${Object.keys(DOMAIN_HANDLERS).length} types de messages supportés`);

  } catch (err) {
    logError('Handler', err);
    throw err;
  }
}

// =======================================================
// MAIN MESSAGE HANDLER
// =======================================================

export function handleMessage(ws, data) {
  try {
    if (!ws.userId) {
      return safeSend(ws, {
        type: 'error',
        message: 'Utilisateur non identifié',
        code: 'UNAUTHORIZED'
      });
    }

    const validation = validateMessage(data);
    if (!validation.valid) {
      return safeSend(ws, {
        type: 'error',
        message: validation.error,
        code: 'INVALID_MESSAGE'
      });
    }
    console.log("RATE CHECK:", data.type);
    if (!NO_RATE_LIMIT_TYPES.has(data.type)) {

  if (data.type === 'chatMessage') {
    if (!chatLimiter.isAllowed(ws.userId)) {
      return safeSend(ws, {
        type: 'error',
        message: 'Trop de messages',
        code: 'RATE_LIMITED'
      });
    }
  } else {
    if (!actionLimiter.isAllowed(ws.userId)) {
      return safeSend(ws, {
        type: 'error',
        message: 'Trop de requêtes',
        code: 'RATE_LIMITED'
      });
    }
  }
}

    const messageType = data.type;
    logInfo('Handler', `📩 ${ws.userId} (${ws.role}): ${messageType}`);

    const domain = DOMAIN_HANDLERS[messageType];
    if (!domain) {
      return safeSend(ws, {
        type: 'error',
        message: `Type de message inconnu: ${messageType}`,
        code: 'UNKNOWN_MESSAGE_TYPE'
      });
    }

    const domainHandler = HANDLERS_BY_DOMAIN[domain];
    if (!domainHandler) {
      return safeSend(ws, {
        type: 'error',
        message: 'Erreur serveur interne',
        code: 'INTERNAL_ERROR'
      });
    }

    domainHandler(ws, data);

  } catch (err) {
    logError('Handler', err);
    safeSend(ws, {
      type: 'error',
      message: 'Erreur serveur interne',
      code: 'INTERNAL_ERROR'
    });
  }
}

// =======================================================
// DISCONNECT HANDLER
// =======================================================

export async function handleDisconnect(ws) {
  try {
    const userId = ws.userId || 'unknown';
    logInfo('Handler', `❌ Déconnexion: ${userId}`);

    leaveRoom(ws);

    wsContext.clients.delete(userId);

    if (ws.role === 'prof') {
      wsContext.onlineProfessors.delete(userId);
    }

    logSuccess('Handler', `Nettoyage complet pour ${userId}`);

  } catch (err) {
    logError('Handler', err);
  }
}

// =======================================================
// EXPORTS
// =======================================================

export {
  wsContext
};
