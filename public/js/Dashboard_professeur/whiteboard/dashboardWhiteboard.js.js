// ======================================================
// INIT WHITEBOARD — ORCHESTRATION
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
    console.error(`❌ initWhiteboard: canvas "${canvasId}" introuvable`);
    return;
  }

  // 1️⃣ Initialisation du moteur (core)
  WhiteboardCore.init(canvasId);

  // 2️⃣ Initialisation des handlers (souris + tactile)
  initHandlers(canvas);

  // 3️⃣ Initialisation du socket (temps réel)
  if (roomId) {
    WhiteboardSocket.init(roomId);
  } else {
    console.warn("⚠️ initWhiteboard: aucun roomId fourni → pas de synchronisation");
  }

  // 4️⃣ Outils par défaut
  setTool("pen");
  setColor("#000000");
  setSize(3);

  console.log("🎉 Whiteboard initialisé avec succès !");
}
