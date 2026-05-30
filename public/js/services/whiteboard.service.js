// =======================================================
// WHITEBOARD SERVICE ÃÂ¢Ã¢ÂÂ¬Ã¢ÂÂ VERSION FINALE STABLE (PRODUCTION)
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
  // INIT (idempotent + sÃÂ©curisÃÂ©)
  // -----------------------------------------------------
  initCanvas(canvasId, roomId) {

    if (this._initialized) {
      console.warn("ÃÂ¢ÃÂ¡ÃÂ ÃÂ¯ÃÂ¸ÃÂ WhiteboardService dÃÂ©jÃÂ ÃÂ  initialisÃÂÃÂ©");
      return;
    }

    if (!canvasId) {
      console.error("ÃÂ¢ÃÂÃÂ WhiteboardService.initCanvas: canvasId manquant");
      return;
    }

    if (!roomId) {
      console.error("ÃÂ¢ÃÂÃÂ WhiteboardService.initCanvas: roomId manquant");
      return;
    }

    this._roomId = roomId;
    this._initialized = true;

    // 1Ã¯Â¸ÂÃ¢ÂÂ£ Init canvas + events locaux
    WhiteboardCore.init(canvasId);

    // 2Ã¯Â¸ÂÃ¢ÂÂ£ Envoi des strokes au serveur
    WhiteboardCore.onLocalDraw = (stroke) => {
      socketService.send({
        type: "tableauStroke",
        roomId: this._roomId,
        stroke
      });
    };

    console.log("ÃÂ°ÃÂ¸Ã¢ÂÂÃÂ Whiteboard initialisÃÂÃÂ© ÃÂ¢Ã¢ÂÂ¬Ã¢ÂÂ room :", roomId);

    // -------------------------------------------------
    // BACKEND Ã¢ÂÂ FRONTEND
    // -------------------------------------------------

    // Palette : Stroke distant
    WhiteboardSocket.onRemoteStroke = (stroke) => {
      this.applyRemoteStroke(stroke);
    };

    // Balai : Clear distant
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
    // FRONTEND Ã¢ÂÂ BACKEND
    // -------------------------------------------------
    WhiteboardSocket.enableSync(roomId);
    window.WhiteboardService = this;
    console.log("Ã°ÂÂÂ WhiteboardService initialisÃÂÃÂ© ÃÂ¢Ã¢ÂÂ¬Ã¢ÂÂ room:", roomId);
  },

  // -----------------------------------------------------
  // AJOUT  enableSync expose pour socket.handler.eleve.js
  // -----------------------------------------------------
  enableSync(roomId) {
    const id = roomId || this._roomId;
    if (!id) {
      console.warn("Ã¢ÂÂ Ã¯Â¸Â enableSync: roomId manquant");
      return;
    }
    WhiteboardSocket.enableSync(id);
    console.log("Ã°ÂÂÂ WhiteboardService.enableSync Ã¢ÂÂ room:", id);
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
  // REMOTE STROKES (contrat verrouillÃÂ©)
  // -----------------------------------------------------
  applyRemoteStroke(stroke) {
    if (!WhiteboardState.ctx) return;

    if (!isValidTableauStroke(stroke)) {
      console.error("Ã¢ÂÂ applyRemoteStroke: contrat viole", stroke);
      return;
    }

    WhiteboardCore.remoteStroke(stroke);
  },

  applyRemoteClear() {
    if (!WhiteboardState.ctx) return;
    WhiteboardCore.clear(false);
  },

  // -----------------------------------------------------
  // ACTIONS LOCALES Ã¢ÂÂ BACKEND
  // -----------------------------------------------------
  clear() {
    if (!AppState.sessionInProgress) return;

    if (!this._roomId) {
      console.warn("Ã¢ÂÂ Ã¯Â¸Â clear ignorÃÂ© (roomId non prÃÂªt)");
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

    console.log("ÃÂ°ÃÂ¸ÃÂ§ÃÂ¹ WhiteboardService rÃÂ©initialisÃÂ© proprement");
  }

};

