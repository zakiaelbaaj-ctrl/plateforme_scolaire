// =======================================================
// WHITEBOARD SERVICE â€” VERSION FINALE STABLE (PRODUCTION)
// =======================================================

import { AppState } from "/js/core/state.js";

import { WhiteboardCore } from "/js/modules/whiteboard/whiteboard.core.js";
import { WhiteboardState } from "/js/modules/whiteboard/whiteboard.state.js";
import * as WhiteboardTools from "/js/modules/whiteboard/whiteboard.tools.js";
import { WhiteboardSocket } from "/js/modules/whiteboard/whiteboard.socket.js";
import { isValidTableauStroke } from "/js/services/whiteboard.contract.js";
import { socketService } from "/js/core/socket.service.js";
export const WhiteboardService = {

  // -----------------------------------------------------
  // INTERNAL STATE
  // -----------------------------------------------------
  _initialized: false,
  _roomId: null,

  // -----------------------------------------------------
  // INIT (idempotent + sÃ©curisÃ©)
  // -----------------------------------------------------
  initCanvas(canvasId, roomId) {

    if (this._initialized) {
      console.warn("âš ï¸ WhiteboardService dÃ©jÃ  initialisÃ©");
      return;
    }

    if (!canvasId) {
      console.error("âŒ WhiteboardService.initCanvas: canvasId manquant");
      return;
    }

    if (!roomId) {
      console.error("âŒ WhiteboardService.initCanvas: roomId manquant");
      return;
    }

    this._roomId = roomId;
    this._initialized = true;

    // 1ï¸âƒ£ Init canvas + events locaux
    WhiteboardCore.init(canvasId);

    // 2ï¸âƒ£ Envoi des strokes au serveur
    WhiteboardCore.onLocalDraw = (stroke) => {
      socketService.send({
        type: "tableauStroke",
        roomId: this._roomId,
        stroke
      });
    };

    console.log("ðŸ“ Whiteboard initialisÃ© â€” room :", roomId);

    // -------------------------------------------------
    // BACKEND â†’ FRONTEND
    // -------------------------------------------------

    // ðŸŽ¨ Stroke distant
    WhiteboardSocket.onRemoteStroke = (stroke) => {
      this.applyRemoteStroke(stroke);
    };

    // ðŸ§¹ Clear distant
    WhiteboardSocket.onRemoteClear = () => {
      this.applyRemoteClear();
    };

    WhiteboardSocket.onRemoteSync = (strokes) => {
      if (!Array.isArray(strokes)) return;

      if (!WhiteboardState.ctx) {
        setTimeout(() => {
          WhiteboardSocket.onRemoteSync(strokes);
        }, 50);
        return;
      }

      strokes.forEach(stroke => {
        if (isValidTableauStroke(stroke)) {
          WhiteboardCore.remoteStroke(stroke);
        }
      });
    };

    // -------------------------------------------------
    // FRONTEND â†’ BACKEND
    // -------------------------------------------------
    WhiteboardSocket.enableSync(roomId);
    console.log("ðŸŽ¨ WhiteboardService initialisÃ© â€” room:", roomId);
  },

  // -----------------------------------------------------
  // âœ… AJOUT â€” enableSync exposÃ© pour socket.handler.eleve.js
  // -----------------------------------------------------
  enableSync(roomId) {
    const id = roomId || this._roomId;
    if (!id) {
      console.warn("âš ï¸ enableSync: roomId manquant");
      return;
    }
    WhiteboardSocket.enableSync(id);
    console.log("ðŸ”„ WhiteboardService.enableSync â€” room:", id);
  },

  // -----------------------------------------------------
  // TOOLS
  // -----------------------------------------------------
  setTool(tool) {
    WhiteboardTools.setTool(tool);
  },

  setColor(color) {
    WhiteboardTools.setColor(color);
  },

  setSize(size) {
    WhiteboardTools.setSize(size);
  },

  // -----------------------------------------------------
  // REMOTE STROKES (contrat verrouillÃ©)
  // -----------------------------------------------------
  applyRemoteStroke(stroke) {
    if (!WhiteboardState.ctx) return;

    if (!isValidTableauStroke(stroke)) {
      console.error("âŒ applyRemoteStroke: contrat violÃ©", stroke);
      return;
    }

    WhiteboardCore.remoteStroke(stroke);
  },

  applyRemoteClear() {
    if (!WhiteboardState.ctx) return;
    WhiteboardCore.clear(false);
  },

  // -----------------------------------------------------
  // ACTIONS LOCALES â†’ BACKEND
  // -----------------------------------------------------
  clear() {
    if (!AppState.sessionInProgress) return;

    if (!this._roomId) {
      console.warn("â¸ clear ignorÃ© (roomId non prÃªt)");
      return;
    }

    WhiteboardCore.clear(false);
    WhiteboardSocket.sendClear(this._roomId);
  },

  download() {
    if (WhiteboardCore.download) {
      WhiteboardCore.download();
    }
  },

  // -----------------------------------------------------
  // RESET (fin de session)
  // -----------------------------------------------------
  reset() {
    WhiteboardSocket.disableSync();

    if (WhiteboardCore && typeof WhiteboardCore.destroy === "function") {
      WhiteboardCore.destroy();
    }

    this._initialized = false;
    this._roomId = null;

    console.log("ðŸ§¹ WhiteboardService rÃ©initialisÃ© proprement");
  }

};

