// =======================================================
// WS/AUTH/AUTH.CONTROLLER.JS — VERSION FINALE ROBUSTE
// Responsable : WebSocket (validation + réponses)
// =======================================================

import WebSocket from "ws";
import { safeSend } from "../utils.js";
import { broadcastOnlineProfs } from "../broadcast.js";

export class AuthController {
  constructor(authService, wsContext) {
    this.authService = authService;
    this.wsContext = wsContext;
  }

  /**
   * Identification utilisateur via WebSocket
   * @param {WebSocket} ws
   * @param {object} data
   */
  async handleIdentify(ws, data) {
    try {
      // ---------------------------------------------------
      // 1. Vérification socket vivant
      // ---------------------------------------------------
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // ---------------------------------------------------
      // 2. Validation payload
      // ---------------------------------------------------
      if (!data || typeof data !== "object") {
        return safeSend(ws, {
          type: "auth:error",
          message: "Payload invalide",
          code: "INVALID_PAYLOAD"
        });
      }

      const {
        prenom,
        nom,
        ville = null,
        pays = null
      } = data;

      if (typeof prenom !== "string" || typeof nom !== "string") {
        return safeSend(ws, {
          type: "auth:error",
          message: "Champs manquants",
          code: "MISSING_FIELDS"
        });
      }

      // ---------------------------------------------------
      // 3. Vérification authentification
      // ---------------------------------------------------
      if (!ws.userId) {
        return safeSend(ws, {
          type: "auth:error",
          message: "Utilisateur non authentifié",
          code: "NOT_AUTHENTICATED"
        });
      }

      // ---------------------------------------------------
      // 4. Appel service (async sécurisé)
      // ---------------------------------------------------
      const result = await this.authService.identify(
        ws.userId,
        prenom,
        nom,
        ville,
        pays
      );

      // ---------------------------------------------------
      // 5. Erreur métier
      // ---------------------------------------------------
      if (!result.success) {
        return safeSend(ws, {
          type: "auth:error",
          message: result.error,
          code: result.code
        });
      }

      // ---------------------------------------------------
      // 6. Projection user (propre, sans champs inutiles)
      // ---------------------------------------------------
      const user = {
       id:     result.user.id,
       prenom: result.user.prenom,
       nom:    result.user.nom,
       ville:  result.user.ville,
       pays:   result.user.pays,
       role:   result.user.role   // ✅ ajouté
      };
       ws.role     = result.user.role;
       ws.userName = `${result.user.prenom} ${result.user.nom}`;
      // ---------------------------------------------------
      // 7. Réponse au client (socket encore vivant ?)
      // ---------------------------------------------------
      if (ws.readyState === WebSocket.OPEN) {
        safeSend(ws, {
          type: "auth:identified",
          user
        });
      }

      // ---------------------------------------------------
      // 8. Broadcast profs en ligne
      // ---------------------------------------------------
      if (ws.readyState === WebSocket.OPEN) {
        broadcastOnlineProfs(this.wsContext);
      }

    } catch (err) {
      // ---------------------------------------------------
      // 9. Erreur interne → message générique
      // ---------------------------------------------------
      if (ws && ws.readyState === WebSocket.OPEN) {
        safeSend(ws, {
          type: "auth:error",
          message: "Erreur interne",
          code: "INTERNAL_ERROR"
        });
      }
    }
  }
}
