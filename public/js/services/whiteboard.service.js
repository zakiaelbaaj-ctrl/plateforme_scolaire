// =======================================================
// WHITEBOARD SERVICE — VERSION FINALE STABLE (PRODUCTION)
// =======================================================

import { AppState } from "/js/core/state.js";

import { WhiteboardCore } from "/js/modules/whiteboard/whiteboard.core.js";
import { WhiteboardState } from "/js/modules/whiteboard/whiteboard.state.js";
import * as WhiteboardTools from "/js/modules/whiteboard/whiteboard.tools.js";
import { WhiteboardSocket } from "/js/modules/whiteboard/whiteboard.socket.js";
import { isValidTableauStroke } from "/js/services/whiteboard.contract.js";
import { SocketService } from "/js/core/socket.service.js";

export const WhiteboardService = {

  // -----------------------------------------------------
  // INTERNAL STATE
  // -----------------------------------------------------
  _initialized: false,
  _roomId: null,

  // -----------------------------------------------------
  // INIT (idempotent + sécurisé)
  // -----------------------------------------------------
  initCanvas(canvasId, roomId) {

    if (this._initialized) {
      console.warn("⚠️ WhiteboardService déjà initialisé");
      return;
    }

    if (!canvasId) {
      console.error("❌ WhiteboardService.initCanvas: canvasId manquant");
      return;
    }

    if (!roomId) {
      console.error("❌ WhiteboardService.initCanvas: roomId manquant");
      return;
    }

    this._roomId = roomId;
    this._initialized = true;

    // 1️⃣ Init canvas + events locaux
    WhiteboardCore.init(canvasId);

    // 2️⃣ Envoi des strokes au serveur
    WhiteboardCore.onLocalDraw = (stroke) => {
      SocketService.send({
        type: "tableauStroke",
        roomId: this._roomId,
        stroke
      });
    };

    console.log("📝 Whiteboard initialisé — room :", roomId);

    // -------------------------------------------------
    // BACKEND → FRONTEND
    // -------------------------------------------------

    // 🎨 Stroke distant
    WhiteboardSocket.onRemoteStroke = (stroke) => {
      this.applyRemoteStroke(stroke);
    };

    // 🧹 Clear distant
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
    // FRONTEND → BACKEND
    // -------------------------------------------------
    WhiteboardSocket.enableSync(roomId);
    console.log("🎨 WhiteboardService initialisé — room:", roomId);
  },

  // -----------------------------------------------------
  // ✅ AJOUT — enableSync exposé pour socket.handler.eleve.js
  // -----------------------------------------------------
  enableSync(roomId) {
    const id = roomId || this._roomId;
    if (!id) {
      console.warn("⚠️ enableSync: roomId manquant");
      return;
    }
    WhiteboardSocket.enableSync(id);
    console.log("🔄 WhiteboardService.enableSync — room:", id);
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
  // REMOTE STROKES (contrat verrouillé)
  // -----------------------------------------------------
  applyRemoteStroke(stroke) {
    if (!WhiteboardState.ctx) return;

    if (!isValidTableauStroke(stroke)) {
      console.error("❌ applyRemoteStroke: contrat violé", stroke);
      return;
    }

    WhiteboardCore.remoteStroke(stroke);
  },

  applyRemoteClear() {
    if (!WhiteboardState.ctx) return;
    WhiteboardCore.clear(false);
  },

  // -----------------------------------------------------
  // ACTIONS LOCALES → BACKEND
  // -----------------------------------------------------
  clear() {
    if (!AppState.sessionInProgress) return;

    if (!this._roomId) {
      console.warn("⏸ clear ignoré (roomId non prêt)");
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

    console.log("🧹 WhiteboardService réinitialisé proprement");
  }

};
