// ======================================================
// 🎓 ETUDIANT CALL SERVICE
// Appel direct ciblé (étudiant → étudiant), distinct du matching par file d'attente
// ======================================================

import { socketService } from "/js/core/socket.service.js";
import { Logger as logger } from "/js/lib/logger.js";

export const EtudiantCallService = (() => {

  function callUser(targetUserId) {
    if (!targetUserId) {
      logger.warn("⚠️ callUser appelé sans targetUserId");
      return;
    }
    socketService.send({ type: "student:callUser", targetUserId });
    logger.log("📞 Appel envoyé vers :", targetUserId);
  }

  function acceptCall(callId) {
    if (!callId) return;
    socketService.send({ type: "student:callAccept", callId });
    logger.log("✅ Appel accepté :", callId);
  }

  function declineCall(callId) {
    if (!callId) return;
    socketService.send({ type: "student:callDecline", callId });
    logger.log("🚫 Appel refusé :", callId);
  }

  function cancelCall(callId) {
    if (!callId) return;
    socketService.send({ type: "student:callCancel", callId });
    logger.log("🚫 Appel annulé :", callId);
  }

  return {
    callUser,
    acceptCall,
    declineCall,
    cancelCall,
  };

})();