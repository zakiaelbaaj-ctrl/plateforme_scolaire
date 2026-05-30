// ======================================================
// WHITEBOARD DOMAIN SERVICE
// /js/domains/whiteboard/whiteboard.service.js
// ======================================================

import { AppState }                           from "/js/core/state.js";
import { socketService }                      from "/js/core/socket.service.js";
import { WhiteboardEvents, WhiteboardPayloadFactory } from "./whiteboard.contract.js";
import { DataChannelService } from "/js/webrtc/datachannel.service.js";

// --------------------------------------------------
// ÉTAT INTERNE
// --------------------------------------------------

let _paths       = [];
let _undoStack   = [];
let _redoStack   = [];
let _currentPath = null;
let _myUserId    = null;

// --------------------------------------------------
// CALLBACKS UI
// --------------------------------------------------

const _cb = {
  stroke: null,
  clear:  null,
  sync:   null,
  undo:   null,
  redo:   null,
  text:   null,
  tool:   null,
};

export const WhiteboardService = {

  // ============================
  // ABONNEMENTS UI
  // ============================

  onStroke(cb)     { _cb.stroke = cb; },
  onClear(cb)      { _cb.clear  = cb; },
  onSync(cb)       { _cb.sync   = cb; },
  onUndo(cb)       { _cb.undo   = cb; },
  onRedo(cb)       { _cb.redo   = cb; },
  onText(cb)       { _cb.text   = cb; },
  onToolChange(cb) { _cb.tool   = cb; },

  // ============================
  // INIT SESSION
  // ============================

  initSession() {
    _myUserId = AppState.currentUserId
             ?? AppState.userId
             ?? AppState.currentUser?.id
             ?? JSON.parse(localStorage.getItem("currentUser") || "{}").id
             ?? null;
    console.log("WhiteboardService initSession — _myUserId =", _myUserId);
    if (!_myUserId) console.warn("⚠️ WhiteboardService : userId introuvable");
    this.resetSession();
  },

  resetSession() {
    _paths       = [];
    _undoStack   = [];
    _redoStack   = [];
    _currentPath = null;
  },

  // ============================
  // INIT CANVAS
  // ============================

  initCanvas(canvasId, options = {}) {
    import("/js/ui/components/whiteboard.canvas.js").then(({ WhiteboardCanvas }) => {
     console.log("🖼️ initCanvas appelé", canvasId, options); 
      this._canvas = new WhiteboardCanvas(canvasId, this, {
        colorPicker: options.colorPicker ?? document.getElementById("whiteboardColor"),
        sizeSlider:  options.sizeSlider  ?? document.getElementById("whiteboardSize")
      });

      this.onStroke(() => this._canvas.redraw());
      this.onClear(()  => this._canvas.clear());
      this.onSync(()   => this._canvas.redraw());
      this.onUndo(()   => this._canvas.redraw());
      this.onRedo(()   => this._canvas.redraw());
    });
  },

  // ============================
  // RECEPTION - appelé par SessionService
  // ============================

  handleEvent(data) {
    switch (data.type) {

      case WhiteboardEvents.TABLEAU_STROKE: {
        const path = data.path ?? data.stroke;
        if (!path) break;
        if (!_paths.find(p => p.id === path.id)) {
          _paths.push(path);
          _undoStack.push(path);
          _redoStack = [];
          _paths.sort((a, b) => a.timestamp - b.timestamp);
        }
        _cb.stroke?.(path);
        break;
      }

      case "tableauClear":
      case WhiteboardEvents.TABLEAU_CLEAR: {
        // Efface TOUT le tableau quand le serveur l'ordonne
        this.clearCanvas(false);
        break;
      }

      case WhiteboardEvents.TABLEAU_SYNC: {
        _paths     = data.paths ?? [];
        _undoStack = [..._paths];
        _redoStack = [];
        _cb.sync?.(_paths);
        break;
      }

      case WhiteboardEvents.TABLEAU_UNDO: {
        const idx = [..._undoStack].reverse().findIndex(p => p.authorId === data.authorId);
        if (idx === -1) break;
        const path = _undoStack.splice(_undoStack.length - 1 - idx, 1)[0];
        _redoStack.push(path);
        _paths = _paths.filter(p => p.id !== path.id);
        _cb.undo?.(path);
        break;
      }

      case WhiteboardEvents.TABLEAU_REDO: {
        const idx = [..._redoStack].reverse().findIndex(p => p.authorId === data.authorId);
        if (idx === -1) break;
        const path = _redoStack.splice(_redoStack.length - 1 - idx, 1)[0];
        _undoStack.push(path);
        _paths.push(path);
        _cb.redo?.(path);
        break;
      }

      case WhiteboardEvents.TABLEAU_TEXT: {
        if (!data.textStroke) break;
        _cb.text?.(data.textStroke);
        break;
      }

      case WhiteboardEvents.TABLEAU_TOOL: {
        if (!data.tool) break;
        const normalizedTool = data.tool === "ruler" ? "line" : data.tool;
        _cb.tool?.(normalizedTool);
        this._canvas?.setTool?.(normalizedTool);
        break;
      }

      default:
        console.warn("⚠️ WhiteboardService : event inconnu", data.type);
        break;
    }
  },

  // ============================
  // ACTIONS LOCALES
  // ============================

  // Efface tout + envoie optionnellement au réseau
  clearCanvas(emit = true) {
  _paths     = [];
  _undoStack = [];
  _redoStack = [];

  this._canvas?.clear?.();
  this._canvas?.redraw?.();
  _cb.clear?.();

  if (emit) {
    // DataChannel = étudiants uniquement (peer-to-peer)
    if (DataChannelService.isDrawReady?.()) {
      DataChannelService.clear();
    } else {
      // Prof + Élève = WebSocket vers serveur
      const payload = typeof WhiteboardPayloadFactory.createClear === "function"
        ? WhiteboardPayloadFactory.createClear(AppState.currentRoomId)
        : { type: "tableauClear", roomId: AppState.currentRoomId };

      socketService.send(payload);
    }
  }
},

  startPath(data) {
    _currentPath = {
      id:        crypto.randomUUID(),
      authorId:  _myUserId,
      tool:      data.tool,
      color:     data.color,
      size:      data.size,
      points:    [{ x: data.x, y: data.y }],
      timestamp: Date.now()
    };
  },

  addPoint({ x, y }) {
    if (_currentPath) _currentPath.points.push({ x, y });
  },

  endPath() {
    if (!_currentPath) return;
    const path   = _currentPath;
    console.log("📤 ENVOI STROKE tool=", path.tool);
    _currentPath = null;

    _paths.push(path);
    _undoStack.push(path);
    _redoStack = [];

    _cb.stroke?.(path);

    if (DataChannelService.isDrawReady?.()) {
      DataChannelService.sendStroke(path);
    } else {
      socketService.send(WhiteboardPayloadFactory.createStroke(path, AppState.currentRoomId));
    }
  },
  commitPath(path) {
    console.log("📤 COMMIT STROKE tool=", path.tool);
    _paths.push(path);
    _undoStack.push(path);
    _redoStack = [];
    _cb.stroke?.(path);

    if (DataChannelService.isDrawReady?.()) {
      if (path.tool === "text") {
        DataChannelService.sendText(path);
      } else {
        DataChannelService.sendStroke(path);
      }
    } else {
      socketService.send(
        WhiteboardPayloadFactory.createStroke(path, AppState.currentRoomId)
      );
    }
  },

  sendText(textStroke) {
    if (!textStroke || !_myUserId) return;
    if (DataChannelService.isDrawReady?.()) {
      DataChannelService.sendText(textStroke);
    } else {
      socketService.send(WhiteboardPayloadFactory.createText(textStroke, AppState.currentRoomId));
    }
    _cb.text?.(textStroke);
  },

  setTool(tool) {
    this._currentTool = tool;
    this._canvas?.setTool?.(tool);

    if (typeof WhiteboardPayloadFactory.createTool === "function") {
      socketService.send(WhiteboardPayloadFactory.createTool(tool, AppState.currentRoomId));
    } else {
      socketService.send({ type: "whiteboard:tool", tool, roomId: AppState.currentRoomId });
    }
  },

  undo() {
    const idx = [..._undoStack].reverse().findIndex(p => p.authorId === _myUserId);
    if (idx === -1) return;
    const path = _undoStack.splice(_undoStack.length - 1 - idx, 1)[0];
    _redoStack.push(path);
    _paths = _paths.filter(p => p.id !== path.id);
    _cb.undo?.(path);

    if (DataChannelService.isDrawReady?.()) {
      DataChannelService.sendDraw({ type: "undo", payload: { authorId: _myUserId } });
    } else {
      socketService.send(WhiteboardPayloadFactory.createUndo(_myUserId, AppState.currentRoomId));
    }
  },

  redo() {
    const idx = [..._redoStack].reverse().findIndex(p => p.authorId === _myUserId);
    if (idx === -1) return;
    const path = _redoStack.splice(_redoStack.length - 1 - idx, 1)[0];
    _undoStack.push(path);
    _paths.push(path);
    _cb.redo?.(path);

    if (DataChannelService.isDrawReady?.()) {
      DataChannelService.sendDraw({ type: "redo", payload: { authorId: _myUserId } });
    } else {
      socketService.send(WhiteboardPayloadFactory.createRedo(_myUserId, AppState.currentRoomId));
    }
  },

  getPaths() {
    return [..._paths];
  },

  reset() {
    this.resetSession();
  }
};

// Exposition globale
if (typeof window !== "undefined") {
  window.WhiteboardService = WhiteboardService;
  console.log("✅ WhiteboardService exposé globalement sur window");
}