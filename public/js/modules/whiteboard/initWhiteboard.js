// ======================================================
// INIT WHITEBOARD Ã¢â¬â ORCHESTRATION
// ======================================================

import { WhiteboardCore } from "/js/modules/whiteboard/whiteboard.core.js";
import { WhiteboardSocket } from "/js/modules/whiteboard/whiteboard.socket.js";
import { initWhiteboard as initHandlers } from "/js/modules/whiteboard/whiteboard.handlers.js";
import { setTool, setColor, setSize } from "/js/modules/whiteboard/whiteboard.tools.js";

// ------------------------------------------------------
// INITIALISATION GLOBALE DU WHITEBOARD
// ------------------------------------------------------
export function initWhiteboard(canvasId, roomId) {
  const canvas = document.getElementById(canvasId);

  if (!canvas) {
    console.error(`Ã¢ÂÅ initWhiteboard: canvas "${canvasId}" introuvable`);
    return;
  }

  // 1Ã¯Â¸ÂÃ¢ÆÂ£ Initialisation du moteur (core)
  WhiteboardCore.init(canvasId);

  // 2Ã¯Â¸ÂÃ¢ÆÂ£ Initialisation des handlers (souris + tactile)
  initHandlers(canvas);

  // 3Ã¯Â¸ÂÃ¢ÆÂ£ Initialisation du socket (temps rÃÂ©el)
  if (roomId) {
    WhiteboardSocket.enableSync(roomId);   // Ã¢â Â CORRECTION ICI
  } else {
    console.warn("Ã¢Å¡Â Ã¯Â¸Â initWhiteboard: aucun roomId fourni Ã¢â â pas de synchronisation");
  }

  // 4Ã¯Â¸ÂÃ¢ÆÂ£ Outils par dÃÂ©faut
  setTool("pen");
  setColor("#000000");
  setSize(3);

  console.log("Ã°Å¸Å½â° Whiteboard initialisÃÂ© avec succÃÂ¨s !");
}

