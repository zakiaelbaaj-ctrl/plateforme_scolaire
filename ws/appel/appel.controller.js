// =======================================================
// WS/APPEL/APPEL.CONTROLLER.JS
// Responsabilité UNIQUE : WebSocket (safeSend, broadcast)
// =======================================================

import { 
  safeSend, 
  logSuccess, 
  logError, 
  logWarning, 
  broadcastOnlineProfs, 
  sendToUser
} from '../utils.js';

export class AppelController {
  constructor(appelService, wsContext) {
    this.appelService = appelService;
    this.wsContext = wsContext;
  }

  // =======================================================
  // 1. Élève → callProfessor
  // =======================================================
  handleCallProfessor(ws, data) {
    try {
      const { profId } = data;
      const eleveId = ws.userId;

      if (!eleveId || !ws.userName) {
        return safeSend(ws, {
          type: 'error',
          message: 'Utilisateur non identifié',
          code: 'NOT_IDENTIFIED'
        });
      }

      if (!profId) {
        return safeSend(ws, {
          type: 'error',
          message: 'ID professeur manquant',
          code: 'MISSING_PROF_ID'
        });
      }

      // Service
      const result = this.appelService.callProfessor(eleveId, ws.userName, profId);

      if (!result.success) {
        return safeSend(ws, {
          type: 'error',
          message: result.error,
          code: result.code
        });
      }

      const { appel } = result;

      // Notifier le prof
      const prof = this.wsContext.onlineProfessors.get(profId);
      if (prof?.ws?.readyState === 1) {
        safeSend(prof.ws, {
          type: 'incomingCall',
          appel: {
            id: appel.id,
            eleveId: appel.eleveId,
            eleveName: appel.eleveName,
            createdAt: appel.createdAt
          },
          timestamp: new Date().toISOString()
        });
      }

      // Confirmer à l'élève
      safeSend(ws, {
        type: 'callSent',
        appel: {
          id: appel.id,
          profId: appel.profId,
          status: appel.status
        },
        timestamp: new Date().toISOString()
      });

      logSuccess('AppelController', `📞 Appel créé: ${eleveId} → ${profId}`);

    } catch (err) {
      logError('AppelController', err);
      safeSend(ws, {
        type: 'error',
        message: 'Erreur serveur',
        code: 'INTERNAL_ERROR'
      });
    }
  }

  // =======================================================
  // 2. Prof → acceptCall
  // =======================================================
  handleAcceptCall(ws, data) {
    try {
      const profId = ws.userId;
      const { eleveId } = data;

      if (!profId || ws.role !== 'prof') {
        return safeSend(ws, {
          type: 'error',
          message: 'Seuls les profs peuvent accepter',
          code: 'UNAUTHORIZED'
        });
      }

      if (!eleveId) {
        return safeSend(ws, {
          type: 'error',
          message: 'ID élève manquant',
          code: 'MISSING_ELEVE_ID'
        });
      }

      const result = this.appelService.acceptCall(profId, eleveId);

      if (!result.success) {
        return safeSend(ws, {
          type: 'error',
          message: result.error,
          code: result.code
        });
      }

      const { appel } = result;

      // Notifier l'élève
      sendToUser(this.wsContext.clients, appel.eleveId, {
        type: 'callAccepted',
        appel: {
          id: appel.id,
          profId: appel.profId,
          profName: ws.userName,
          acceptedAt: appel.acceptedAt
        },
        timestamp: new Date().toISOString()
      });

      // Confirmer au prof
      safeSend(ws, {
        type: 'callAccepted',
        appel: {
          id: appel.id,
          eleveId: appel.eleveId,
          eleveName: appel.eleveName,
          status: appel.status
        },
        timestamp: new Date().toISOString()
      });

      // Mettre à jour la liste des profs
      broadcastOnlineProfs(this.wsContext.onlineProfessors, this.wsContext.clients);

      logSuccess('AppelController', `✅ Appel accepté: ${profId} ← ${appel.eleveId}`);

    } catch (err) {
      logError('AppelController', err);
      safeSend(ws, {
        type: 'error',
        message: 'Erreur acceptation appel',
        code: 'ACCEPT_ERROR'
      });
    }
  }

  // =======================================================
  // 3. Prof → rejectCall
  // =======================================================
  handleRejectCall(ws, data) {
    try {
      const profId = ws.userId;
      const { eleveId } = data;

      if (!profId || ws.role !== 'prof') {
        return safeSend(ws, {
          type: 'error',
          message: 'Seuls les profs peuvent rejeter',
          code: 'UNAUTHORIZED'
        });
      }

      if (!eleveId) {
        return safeSend(ws, {
          type: 'error',
          message: 'ID élève manquant',
          code: 'MISSING_ELEVE_ID'
        });
      }

      const result = this.appelService.rejectCall(profId, eleveId);

      if (!result.success) {
        return safeSend(ws, {
          type: 'error',
          message: result.error,
          code: result.code
        });
      }

      const { appel } = result;

      // Notifier l'élève
      sendToUser(this.wsContext.clients, appel.eleveId, {
        type: 'callRejected',
        appel: {
          id: appel.id,
          profId: appel.profId,
          reason: 'rejected_by_professor'
        },
        timestamp: new Date().toISOString()
      });

      // Confirmer au prof
      safeSend(ws, {
        type: 'callRejected',
        appel: {
          id: appel.id,
          status: appel.status
        }
      });

      logSuccess('AppelController', `❌ Appel rejeté: ${profId}`);

    } catch (err) {
      logError('AppelController', err);
      safeSend(ws, {
        type: 'error',
        message: 'Erreur rejet appel',
        code: 'REJECT_ERROR'
      });
    }
  }

  // =======================================================
  // 4. Élève → cancelCall
  // =======================================================
  handleCancelCall(ws, data) {
    try {
      const { profId } = data;
      const eleveId = ws.userId;

      if (!eleveId || ws.role !== 'eleve') {
        return safeSend(ws, {
          type: 'error',
          message: 'Seuls les élèves peuvent annuler',
          code: 'UNAUTHORIZED'
        });
      }

      if (!profId) {
        return safeSend(ws, {
          type: 'error',
          message: 'ID professeur manquant',
          code: 'MISSING_PROF_ID'
        });
      }

      const result = this.appelService.cancelCall(eleveId, profId);

      if (!result.success) {
        return safeSend(ws, {
          type: 'error',
          message: result.error,
          code: result.code
        });
      }

      const { appel } = result;

      // Notifier le prof
      const prof = this.wsContext.onlineProfessors.get(profId);
      if (prof?.ws?.readyState === 1) {
        safeSend(prof.ws, {
          type: 'callCancelled',
          appel: {
            id: appel.id,
            eleveId: appel.eleveId,
            reason: 'cancelled_by_student'
          },
          timestamp: new Date().toISOString()
        });
      }

      // Confirmer à l'élève
      safeSend(ws, {
        type: 'callCancelled',
        appel: {
          id: appel.id,
          status: appel.status
        }
      });

      logSuccess('AppelController', `❌ Appel annulé: ${eleveId} → ${profId}`);

    } catch (err) {
      logError('AppelController', err);
      safeSend(ws, {
        type: 'error',
        message: 'Erreur annulation appel',
        code: 'CANCEL_ERROR'
      });
    }
  }

  // =======================================================
  // 5. endCall (prof ou élève)
  // =======================================================
  handleEndCall(ws, data) {
    try {
      const { appelId } = data;

      if (!appelId) {
        return safeSend(ws, {
          type: 'error',
          message: 'ID appel manquant',
          code: 'MISSING_CALL_ID'
        });
      }

      const result = this.appelService.endCall(appelId);

      if (!result.success) {
        return safeSend(ws, {
          type: 'error',
          message: result.error,
          code: result.code
        });
      }

      const { appel, duration } = result;

      // Notifier élève
      sendToUser(this.wsContext.clients, appel.eleveId, {
        type: 'callEnded',
        appel: {
          id: appel.id,
          duration,
          status: appel.status
        },
        timestamp: new Date().toISOString()
      });

      // Notifier prof
      sendToUser(this.wsContext.clients, appel.profId, {
        type: 'callEnded',
        appel: {
          id: appel.id,
          duration,
          status: appel.status
        },
        timestamp: new Date().toISOString()
      });

      logSuccess('AppelController', `🏁 Appel terminé: ${appelId} (${duration}s)`);

    } catch (err) {
      logError('AppelController', err);
      safeSend(ws, {
        type: 'error',
        message: 'Erreur fermeture appel',
        code: 'END_CALL_ERROR'
      });
    }
  }
    // =======================================================
  // 6. endSession (prof ou élève) — FIN DE SESSION VISIO
  // =======================================================
  async handleEndSession(ws, data) {
    try {
      const roomId = ws.roomId;

      if (!roomId) {
        return safeSend(ws, {
          type: 'error',
          message: 'Room ID manquant pour endSession',
          code: 'MISSING_ROOM_ID'
        });
      }

      // 1️⃣ Stopper Stripe (facturation)
      await this.appelService.endStripeSession(roomId);

      // 2️⃣ Notifier les deux clients (prof + élève)
      this.appelService.broadcast(roomId, {
        type: 'session:stop',
        timestamp: new Date().toISOString()
      });

      // 3️⃣ Nettoyage serveur
      this.appelService.endServerSession(roomId);

      logSuccess('AppelController', `🛑 Session terminée pour room ${roomId}`);

    } catch (err) {
      logError('AppelController', err);
      safeSend(ws, {
        type: 'error',
        message: 'Erreur endSession',
        code: 'END_SESSION_ERROR'
      });
    }
  }
}


