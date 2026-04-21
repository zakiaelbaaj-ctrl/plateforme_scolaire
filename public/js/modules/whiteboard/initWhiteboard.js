// ======================================================
// INIT WHITEBOARD â€” ORCHESTRATION
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
    console.error(`âŒ initWhiteboard: canvas "${canvasId}" introuvable`);
    return;
  }

  // 1ï¸âƒ£ Initialisation du moteur (core)
  WhiteboardCore.init(canvasId);

  // 2ï¸âƒ£ Initialisation des handlers (souris + tactile)
  initHandlers(canvas);

  // 3ï¸âƒ£ Initialisation du socket (temps rÃ©el)
  if (roomId) {
    WhiteboardSocket.enableSync(roomId);   // â† CORRECTION ICI
  } else {
    console.warn("âš ï¸ initWhiteboard: aucun roomId fourni â†’ pas de synchronisation");
  }

  // 4ï¸âƒ£ Outils par dÃ©faut
  setTool("pen");
  setColor("#000000");
  setSize(3);

  console.log("ðŸŽ‰ Whiteboard initialisÃ© avec succÃ¨s !");
}

