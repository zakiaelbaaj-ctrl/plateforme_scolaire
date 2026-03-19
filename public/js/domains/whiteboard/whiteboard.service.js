// ======================================================
// WHITEBOARD DOMAIN SERVICE
// /js/domains/whiteboard/whiteboard.service.js
// ======================================================

import { AppState }                                   from "/js/core/state.js";
import { SocketService }                              from "/js/core/socket.service.js";
import { WhiteboardEvents, WhiteboardPayloadFactory } from "./whiteboard.contract.js";

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
};

export const WhiteboardService = {

  // ============================
  // ABONNEMENTS UI
  // ============================

  onStroke(cb) { _cb.stroke = cb; },
  onClear(cb)  { _cb.clear  = cb; },
  onSync(cb)   { _cb.sync   = cb; },
  onUndo(cb)   { _cb.undo   = cb; },
  onRedo(cb)   { _cb.redo   = cb; },
  onText(cb)   { _cb.text   = cb; },


  // ============================
  // INIT SESSION
  // ============================

  initSession() {
    _myUserId = AppState.currentUserId ?? AppState.userId ?? null;
    if (!_myUserId) console.warn("⚠️ WhiteboardService : userId introuvable dans AppState");
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
  // RÉCEPTION — appelé par SessionService
  // ============================

  handleEvent(data) {
    switch (data.type) {

      case WhiteboardEvents.TABLEAU_STROKE: {
  const path = data.path ?? data.stroke;  // ← accepte les deux
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
      case WhiteboardEvents.TABLEAU_CLEAR: {
        const authorId = data.authorId;
        _paths     = _paths.filter(p => p.authorId !== authorId);
        _undoStack = _undoStack.filter(p => p.authorId !== authorId);
        _redoStack = _redoStack.filter(p => p.authorId !== authorId);
        _cb.clear?.();
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
       case WhiteboardEvents.TABLEAU_TEXT: {   // 🔹 Ajouter ce case
       if (!data.textStroke) break;          // ⚡ Vérifie que le texte existe
       _cb.text?.(data.textStroke);          // ⚡ Appelle le callback UI
        break;
      }
      default:
        console.warn("⚠️ WhiteboardService : event inconnu", data.type);
       }
     },
  // ============================
  // ACTIONS LOCALES
  // ============================

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
    _currentPath = null;

    _paths.push(path);
    _undoStack.push(path);
    _redoStack = [];

    _cb.stroke?.(path);
    SocketService.send(WhiteboardPayloadFactory.createStroke(path, AppState.currentRoomId));
  },
  sendText(textStroke) {                  // 🔹 Nouvelle méthode
  if (!textStroke || !_myUserId) return;
  SocketService.send(WhiteboardPayloadFactory.createText(textStroke, AppState.currentRoomId));
  _cb.text?.(textStroke);               // ⚡ Callback local pour redessiner immédiatement
  },
  setTool(tool) {
  this._currentTool = tool;
  // ⚡ Optionnel : notifier le canvas pour redessiner si nécessaire
  if (this._canvas) this._canvas.setTool?.(tool);
  },
  undo() {
    const idx = [..._undoStack].reverse().findIndex(p => p.authorId === _myUserId);
    if (idx === -1) return;
    const path = _undoStack.splice(_undoStack.length - 1 - idx, 1)[0];
    _redoStack.push(path);
    _paths = _paths.filter(p => p.id !== path.id);

    _cb.undo?.(path);
    SocketService.send(WhiteboardPayloadFactory.createUndo(_myUserId, AppState.currentRoomId));
  },

  redo() {
    const idx = [..._redoStack].reverse().findIndex(p => p.authorId === _myUserId);
    if (idx === -1) return;
    const path = _redoStack.splice(_redoStack.length - 1 - idx, 1)[0];
    _undoStack.push(path);
    _paths.push(path);

    _cb.redo?.(path);
    SocketService.send(WhiteboardPayloadFactory.createRedo(_myUserId, AppState.currentRoomId));
  },

  clearBoard() {
    _paths     = _paths.filter(p => p.authorId !== _myUserId);
    _undoStack = _undoStack.filter(p => p.authorId !== _myUserId);
    _redoStack = _redoStack.filter(p => p.authorId !== _myUserId);

    _cb.clear?.();
    SocketService.send(WhiteboardPayloadFactory.createClear(AppState.currentRoomId));
  },

  getPaths() {
    return [..._paths];
  },

  reset() {
    this.resetSession();
  }
};