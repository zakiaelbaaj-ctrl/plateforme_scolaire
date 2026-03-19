// =======================================================
// WS/AUTH/HANDLERS.JS — VERSION SENIOR AMÉLIORÉE
// =======================================================

import { logSuccess, logWarning, logError } from '../utils.js';
import { authService } from './auth.service.js';
import { authState } from './auth.state.js';

// -------------------------------------------------------
// Erreur infra (socket mort, corruption IO, etc.)
// -------------------------------------------------------
class InfraSocketError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InfraSocketError';
  }
}

// -------------------------------------------------------
// Projection user centralisée
// -------------------------------------------------------
function projectUser(user) {
  return {
    id: user.id,
    role: user.role,
    email: user.email
  };
}

// -------------------------------------------------------
// Vérifier que le socket est encore vivant
// -------------------------------------------------------
function ensureSocketAlive(socket) {
  if (!socket || socket.disconnected) {
    throw new InfraSocketError('Socket déconnecté');
  }
}

// -------------------------------------------------------
// safeExecute :
// - handler contractuellement async
// - logs cohérents
// - distinction infra/business
// - handler ne doit jamais émettre
// -------------------------------------------------------
async function safeExecute(eventName, socket, payload, handler) {
  try {
    ensureSocketAlive(socket);

    const result = await Promise.resolve(
      handler(payload ?? {}, socket)
    );

    socket.emit(`auth:${eventName}:success`, {
      ok: true,
      event: eventName,
      data: result
    });

    logSuccess('AuthHandlers', `${eventName} OK`);
    return result;

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue';

    // Erreur infra → log différent, pas d’émission WS
    if (err instanceof InfraSocketError) {
      logError('AuthInfra', `${eventName} — ${message}`);
      return null;
    }

    // Erreur métier → émission WS
    logError('AuthHandlers', `${eventName} ERROR: ${message}`);

    if (socket && !socket.disconnected) {
      socket.emit(`auth:${eventName}:error`, {
        ok: false,
        event: eventName,
        error: message
      });
    }

    return null;
  }
}

// =======================================================
// HANDLERS AUTH
// =======================================================

async function handleLogin(payload, socket) {
  return safeExecute('login', socket, payload, async ({ email, password }) => {
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new Error('Email et mot de passe requis');
    }

    const user = await authService.login(email, password);

    authState.setUser(socket.id, user);

    return projectUser(user);
  });
}

async function handleLogout(payload, socket) {
  return safeExecute('logout', socket, payload, async () => {
    const user = authState.getUser(socket.id);

    // Idempotent + nettoyage préventif
    authState.removeUser(socket.id);

    if (!user) {
      logWarning('AuthHandlers', `Logout sans user (socket ${socket.id})`);
      return { message: 'Déconnexion effectuée' };
    }

    return { message: 'Déconnexion réussie' };
  });
}

async function handleVerifyToken(payload, socket) {
  return safeExecute('verifyToken', socket, payload, async ({ token }) => {
    if (!token || typeof token !== 'string') {
      throw new Error('Token requis');
    }

    const user = await authService.verifyToken(token);

    authState.setUser(socket.id, user);

    return projectUser(user);
  });
}

async function handleGetMe(payload, socket) {
  return safeExecute('getMe', socket, payload, async () => {
    const user = authState.getUser(socket.id);

    if (!user) {
      throw new Error('Utilisateur non authentifié');
    }

    return projectUser(user);
  });
}

// =======================================================
// EXPORTS
// =======================================================

export const authHandlers = {
  login: handleLogin,
  logout: handleLogout,
  verifyToken: handleVerifyToken,
  getMe: handleGetMe
};
