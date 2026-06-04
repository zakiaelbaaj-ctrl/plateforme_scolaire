// ======================================================
// 🎓 ETUDIANT SESSION SERVICE
// // Gestionnaire de signaux et actions de session (Passif)
// ======================================================

import { AppState }         from "/js/core/state.js";
import { socketService }     from "/js/core/socket.service.js";
import { Logger as logger } from "/js/lib/logger.js";

export const EtudiantSessionService = {

  // ====================================================
  // INIT
  // ====================================================

  init() {
    logger.log("📦 EtudiantSessionService initialisé");
  },

  // ====================================================
  // ACTIONS DE SIGNALING (WebRTC)
  // ====================================================

  /**
   * Envoie un signal WebRTC (Offre, Réponse ou Candidat ICE) au partenaire via le serveur.
   * @param {Object} signal - Le payload du signal WebRTC (sdp ou candidate)
   */
  sendSignal(signal) {
    const roomId = AppState.currentRoomId;
    if (!roomId) {
      logger.warn("⚠️ Impossible d'envoyer le signal : aucune currentRoomId dans AppState");
      return;
    }

    logger.log(`📡 Envoi du signal réseau [${signal.type}] pour la room : ${roomId}`);
    
    socketService.send({
      type: "student:signal",
      roomId,
      signal
    });
  },

  // ====================================================
  // ACTIONS DE FIN DE SESSION
  // ====================================================

  /**
   * Informe le serveur WebSocket que l'étudiant quitte volontairement la room.
   */
  leaveRoom() {
    const roomId = AppState.currentRoomId;
    if (!roomId) {
      logger.warn("⚠️ Impossible d'envoyer le signal de départ : aucune currentRoomId active");
      return;
    }

    logger.log(`🚪 Envoi de la trame student:leaveRoom pour la room : ${roomId}`);
    
    socketService.send({
      type: "student:leaveRoom",
      roomId
    });
  }
};