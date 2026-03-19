// =======================================================
// WS/AUTH/AUTH.ROUTER.JS — ROUTER WEBSOCKET AUTH (SENIOR / PROD-FRIENDLY)
// =======================================================

import { AuthController } from "./auth.controller.js";
import { authService } from "./auth.service.js";
import { logDebug, logWarning, logError } from "../utils.js";
import WebSocket from "ws"; // pour les constantes readyState

// Empêche l’attachement multiple du router au même socket
const attachedSockets = new Map();

/**
 * Initialise les routes WebSocket liées à l'authentification
 * @param {WebSocket} ws - socket WebSocket natif
 * @param {object} wsContext - contexte global WS (liste clients, state, etc.)
 */
export function initAuthRouter(ws, wsContext) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;

  // -----------------------------------------------------
  // 1. Empêcher double attachement
  // -----------------------------------------------------
  if (attachedSockets.has(ws.id)) {
    logWarning(`[AuthRouter] Router déjà attaché au socket ${ws.id}`);
    return;
  }
  attachedSockets.set(ws.id, true);

  // -----------------------------------------------------
  // 2. Nettoyage à la déconnexion → évite fuite mémoire
  // -----------------------------------------------------
  ws.on("close", () => {
    attachedSockets.delete(ws.id);
    logDebug(`[AuthRouter] Nettoyage socket ${ws.id}`);
  });

  // -----------------------------------------------------
  // 3. Controller par socket
  // -----------------------------------------------------
  const controller = new AuthController(authService, wsContext);

  // -----------------------------------------------------
  // 4. Helper factorisé + logs centralisés
  // -----------------------------------------------------
  const bind = (eventName, handler) => {
    ws.on(eventName, async (data) => {
      // Vérifier socket vivant
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        logWarning(`[AuthRouter] Socket ${ws.id} non ouvert ou fermé avant handler ${eventName}`);
        return;
      }

      // Trace debug en dev uniquement
      if (process.env.NODE_ENV !== "production") {
        logDebug(`[AuthRouter] ${eventName} reçu (socket ${ws.id})`);
      }

      try {
        await Promise.resolve(handler(data));
      } catch (err) {
        logError(`[AuthRouter] Erreur handler ${eventName} (socket ${ws.id}): ${err.stack ?? err.message ?? err}`);
      }
    });
  };

  // -----------------------------------------------------
  // 5. ROUTES WS AUTH
  // -----------------------------------------------------
  bind("auth:identify", (data) => controller.handleIdentify(ws, data));
  bind("auth:verifyToken", (data) => controller.handleVerifyToken?.(ws, data));
  bind("auth:logout", () => controller.handleLogout?.(ws));
  bind("auth:getMe", () => controller.handleGetMe?.(ws));
}
