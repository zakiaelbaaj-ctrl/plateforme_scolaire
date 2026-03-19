// =======================================================
// WS/APPEL/APPEL.SERVICE.JS
// Responsabilité UNIQUE : Logique métier (AUCUN safeSend)
// =======================================================

import { logSuccess, logError } from '../utils.js';
import { appelState } from './appel.state.js';
import { AppelQueue } from './ws/queue/appel.queue.js';
import { startAppelTimer, stopAppelTimer } from './ws/time/appel.timer.js';

export class AppelService {
  constructor(onlineProfessorsState) {
    this.onlineProfessorsState = onlineProfessorsState;
    this.appelQueue = new AppelQueue();
  }

  /**
   * Créer un appel
   * Responsabilité: UNIQUEMENT logique métier
   * Returns: { success, appel?, error? }
   */
  callProfessor(eleveId, eleveName, profId) {
    try {
      // Vérifier que le prof existe
      const prof = this.onlineProfessorsState.get(profId);
      if (!prof) {
        return {
          success: false,
          error: 'Professeur introuvable',
          code: 'PROF_NOT_FOUND'
        };
      }

      // Vérifier que le prof est disponible
      if (!prof.available) {
        return {
          success: false,
          error: 'Professeur non disponible',
          code: 'PROF_UNAVAILABLE'
        };
      }

      // Créer l'appel
      const appel = {
        id: `appel_${eleveId}_${profId}_${Date.now()}`,
        eleveId,
        eleveName,
        profId,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60000) // 1 minute
      };

      // Sauvegarder dans le state
      appelState.addPendingCall(profId, appel);
      this.appelQueue.add(appel);

      logSuccess('AppelService', `📞 Appel créé: ${eleveId} → ${profId}`);

      return {
        success: true,
        appel
      };

    } catch (err) {
      logError('AppelService', err);
      return {
        success: false,
        error: 'Erreur création appel',
        code: 'CALL_ERROR'
      };
    }
  }

  /**
   * Accepter un appel
   * Responsabilité: UNIQUEMENT logique métier
   * Returns: { success, appel?, error? }
   */
  acceptCall(profId, eleveData) {
    try {
      // Récupérer l'appel en attente
      const appel = appelState.getPendingCall(profId);
      if (!appel) {
        return {
          success: false,
          error: 'Pas d\'appel en attente',
          code: 'NO_PENDING_CALL'
        };
      }

      // Vérifier que c'est le bon élève
      if (appel.eleveId !== eleveData.eleveId) {
        return {
          success: false,
          error: 'Identité élève invalide',
          code: 'INVALID_ELEVE'
        };
      }

      // Mettre à jour l'appel
      appel.status = 'accepted';
      appel.acceptedAt = new Date();
      appel.startedAt = new Date();

      // Déplacer vers appels actifs
      appelState.acceptCall(profId, appel);

      // Démarrer le timer
      startAppelTimer(appel.id);

      logSuccess('AppelService', `✅ Appel accepté: ${profId} ← ${appel.eleveId}`);

      return {
        success: true,
        appel
      };

    } catch (err) {
      logError('AppelService', err);
      return {
        success: false,
        error: 'Erreur acceptation appel',
        code: 'ACCEPT_ERROR'
      };
    }
  }

  /**
   * Rejeter un appel
   * Responsabilité: UNIQUEMENT logique métier
   * Returns: { success, appel?, error? }
   */
  rejectCall(profId) {
    try {
      const appel = appelState.getPendingCall(profId);
      if (!appel) {
        return {
          success: false,
          error: 'Pas d\'appel à rejeter',
          code: 'NO_PENDING_CALL'
        };
      }

      // Mettre à jour l'appel
      appel.status = 'rejected';
      appel.rejectedAt = new Date();

      // Nettoyer
      appelState.rejectCall(profId);
      this.appelQueue.remove(appel.id);

      logSuccess('AppelService', `❌ Appel rejeté: ${profId}`);

      return {
        success: true,
        appel
      };

    } catch (err) {
      logError('AppelService', err);
      return {
        success: false,
        error: 'Erreur rejet appel',
        code: 'REJECT_ERROR'
      };
    }
  }

  /**
   * Annuler un appel
   * Responsabilité: UNIQUEMENT logique métier
   * Returns: { success, appel?, error? }
   */
  cancelCall(eleveId, profId) {
    try {
      const appel = appelState.getPendingCall(profId);
      if (!appel || appel.eleveId !== eleveId) {
        return {
          success: false,
          error: 'Appel non trouvé',
          code: 'CALL_NOT_FOUND'
        };
      }

      // Mettre à jour l'appel
      appel.status = 'cancelled';
      appel.cancelledAt = new Date();

      // Nettoyer
      appelState.cancelCall(profId);
      this.appelQueue.remove(appel.id);

      logSuccess('AppelService', `❌ Appel annulé: ${eleveId} → ${profId}`);

      return {
        success: true,
        appel
      };

    } catch (err) {
      logError('AppelService', err);
      return {
        success: false,
        error: 'Erreur annulation appel',
        code: 'CANCEL_ERROR'
      };
    }
  }

  /**
   * Terminer un appel et calculer la durée
   * Responsabilité: UNIQUEMENT logique métier
   * Returns: { success, appel?, duration?, error? }
   */
  endCall(appelId) {
    try {
      const appel = appelState.getActiveCall(appelId);
      if (!appel) {
        return {
          success: false,
          error: 'Appel non trouvé',
          code: 'CALL_NOT_FOUND'
        };
      }

      // Arrêter le timer
      stopAppelTimer(appelId);

      // Calculer la durée
      const duration = Math.floor((Date.now() - appel.startedAt.getTime()) / 1000);

      // Mettre à jour l'appel
      appel.status = 'ended';
      appel.endedAt = new Date();
      appel.duration = duration;

      // Nettoyer
      appelState.endCall(appelId);
      this.appelQueue.remove(appelId);

      logSuccess('AppelService', `🏁 Appel terminé: ${appelId} (${duration}s)`);

      return {
        success: true,
        appel,
        duration
      };

    } catch (err) {
      logError('AppelService', err);
      return {
        success: false,
        error: 'Erreur fermeture appel',
        code: 'END_CALL_ERROR'
      };
    }
  }

  /**
   * Obtenir les appels en attente
   */
  getPendingCalls() {
    return Array.from(appelState.pendingCalls.values());
  }

  /**
   * Obtenir les appels actifs
   */
  getActiveCalls() {
    return Array.from(appelState.activeCalls.values());
  }

  /**
   * Obtenir un appel spécifique
   */
  getCall(appelId) {
    return appelState.getActiveCall(appelId) || 
           Array.from(appelState.pendingCalls.values()).find(a => a.id === appelId);
  }
    // =======================================================
  // 7. Fin de session visio → Stripe + nettoyage serveur
  // =======================================================
  async endStripeSession(roomId) {
    const [session] = await sequelize.query(
      `SELECT stripe_session_id FROM calls WHERE room_id = :roomId LIMIT 1`,
      { replacements: { roomId }, type: sequelize.QueryTypes.SELECT }
    );

    if (!session) {
      console.warn("⚠️ Aucune session Stripe trouvée pour room", roomId);
      return;
    }

    await stripe.checkout.sessions.expire(session.stripe_session_id);

    console.log("🛑 Session Stripe terminée", roomId);
  }

  endServerSession(roomId) {
    this.activeCalls?.delete(roomId);
    console.log("🧹 Session serveur nettoyée", roomId);
  }
}
