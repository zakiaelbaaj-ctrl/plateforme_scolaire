// ======================================================
// ÉTUDIANT MATCHING SERVICE
// Gestion de la file d'attente (student → student)
// ======================================================

import { socketService } from "/js/core/socket.service.js";
import { AppState }      from "/js/core/state.js";
import { eventBus }      from "/js/core/eventBus.js";
import { Logger as logger } from "/js/lib/logger.js";
// ======================================================
// SERVICE
// ======================================================

export const EtudiantMatchingService = (() => {

  // ====================================================
  // ÉTAT LOCAL
  // ====================================================

  let isQueueing = false;
  let lastMatiere = null;
  let lastSujet = "";
  // ====================================================
  // INIT
  // ====================================================

  function init() {
    logger.log("🎯 EtudiantMatchingService initialisé");
  }

  // ====================================================
  // 🎯 ENQUEUE (entrée en file d'attente)
  // ====================================================

  function enqueue(matiere, sujet = "") {
    // VERIFICATION STRICTE
    if (!AppState.isSubscribed) {
        logger.warn("⚠️ Tentative de matching sans abonnement");
        eventBus.emit("ui:subscription-required"); // Déclenche l'affichage du modal
        return;
    }
    if (!matiere) {
      logger.warn("⚠️ enqueue sans matière");
return;
    }

    lastMatiere = matiere;
    lastSujet   = sujet;
    isQueueing   = true;

    socketService.send({
      type: "student:enqueue",
      matiere,
      sujet,
    });

    AppState.isQueueing = true;

    eventBus.emit("matching:queued", {
      matiere,
      sujet,
    });

    logger.log("⏳ En file d'attente :", matiere);
  }

  // ====================================================
  // 🚫 DEQUEUE (sortie file)
  // ====================================================

  function dequeue() {
    socketService.send({
      type: "student:dequeue",
    });

    isQueueing = false;
    AppState.isQueueing = false;

    eventBus.emit("matching:cancelled");

    logger.log("🚫 Sortie file d'attente");
  }

  // ====================================================
  // 🔄 REQUEUE (reprise automatique si besoin)
  // ====================================================

  function requeue() {
    if (!lastMatiere) return;

    logger.log("🔄 Requeue :", lastMatiere);

    enqueue(lastMatiere, lastSujet);
  }

  eventBus.on("matching:retry-enqueue", () => {
  if (!lastMatiere) {
    logger.warn("⚠️ Retry enqueue demandé mais aucune matière mémorisée — abandon");
    return;
  }
  logger.log("🔄 Nouvelle tentative d'enqueue après NOT_IDENTIFIED");
  setTimeout(() => enqueue(lastMatiere, lastSujet), 500);
});
  // ====================================================
  // // 📡 EVENTS SOCKET → MATCH RESULT
  // ====================================================

  function handleMatchFound(data) {
    isQueueing = false;
    AppState.isQueueing = false;
    
   logger.log("🎯 Match reçu (matching service)");
    logger.log("🔍 Match trouvé :", data.roomId);
    AppState.startSession({ roomId: data.roomId });
  }

  function handleQueueStatus(data) {
    eventBus.emit("matching:status", {
      position: data.position,
      estimated: data.estimatedTime,
    });
  }

  // ====================================================
  // GETTERS
  // ====================================================

  function getState() {
    return {
      isQueueing,
      lastMatiere,
      lastSujet,
    };
  }

  function isInQueue() {
    return isQueueing;
  }

  // ====================================================
  // PUBLIC API
  // ====================================================

  return {
    init,

    enqueue,
    dequeue,
    requeue,

    handleMatchFound,
    handleQueueStatus,

    getState,
    isInQueue,
  };

})();