// ======================================================
// WHITEBOARD DOMAIN SERVICE
// /js/domains/whiteboard/whiteboard.service.js
// ======================================================

import { AppState }                                   from "/js/core/state.js";
import { socketService }                              from "/js/core/socket.service.js";
import { WhiteboardEvents, WhiteboardPayloadFactory } from "./whiteboard.contract.js";

// --------------------------------------------------
// Ãƒâ€°TAT INTERNE
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
    if (!_myUserId) console.warn("Ã¢Å¡Â Ã¯Â¸Â WhiteboardService : userId introuvable dans AppState");
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
  // RÃƒâ€°CEPTION Ã¢â‚¬â€ appelÃƒÂ© par SessionService
  // ============================

  handleEvent(data) {
    switch (data.type) {

      case WhiteboardEvents.TABLEAU_STROKE: {
  const path = data.path ?? data.stroke;  // Ã¢â€ Â accepte les deux
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
       case WhiteboardEvents.TABLEAU_TEXT: {   // Ã°Å¸â€Â¹ Ajouter ce case
       if (!data.textStroke) break;          // Ã¢Å¡Â¡ VÃƒÂ©rifie que le texte existe
       _cb.text?.(data.textStroke);          // Ã¢Å¡Â¡ Appelle le callback UI
        break;
      }
      default:
        console.warn("Ã¢Å¡Â Ã¯Â¸Â WhiteboardService : event inconnu", data.type);
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
    socketService.send(WhiteboardPayloadFactory.createStroke(path, AppState.currentRoomId));
  },
  sendText(textStroke) {                  // Ã°Å¸â€Â¹ Nouvelle mÃƒÂ©thode
  if (!textStroke || !_myUserId) return;
  socketService.send(WhiteboardPayloadFactory.createText(textStroke, AppState.currentRoomId));
  _cb.text?.(textStroke);               // Ã¢Å¡Â¡ Callback local pour redessiner immÃƒÂ©diatement
  },
  setTool(tool) {
  this._currentTool = tool;
  // Ã¢Å¡Â¡ Optionnel : notifier le canvas pour redessiner si nÃƒÂ©cessaire
  if (this._canvas) this._canvas.setTool?.(tool);
  },
  undo() {
    const idx = [..._undoStack].reverse().findIndex(p => p.authorId === _myUserId);
    if (idx === -1) return;
    const path = _undoStack.splice(_undoStack.length - 1 - idx, 1)[0];
    _redoStack.push(path);
    _paths = _paths.filter(p => p.id !== path.id);

    _cb.undo?.(path);
    socketService.send(WhiteboardPayloadFactory.createUndo(_myUserId, AppState.currentRoomId));
  },

  redo() {
    const idx = [..._redoStack].reverse().findIndex(p => p.authorId === _myUserId);
    if (idx === -1) return;
    const path = _redoStack.splice(_redoStack.length - 1 - idx, 1)[0];
    _undoStack.push(path);
    _paths.push(path);

    _cb.redo?.(path);
    socketService.send(WhiteboardPayloadFactory.createRedo(_myUserId, AppState.currentRoomId));
  },

  clearBoard() {
    _paths     = _paths.filter(p => p.authorId !== _myUserId);
    _undoStack = _undoStack.filter(p => p.authorId !== _myUserId);
    _redoStack = _redoStack.filter(p => p.authorId !== _myUserId);

    _cb.clear?.();
    socketService.send(WhiteboardPayloadFactory.createClear(AppState.currentRoomId));
  },

  getPaths() {
    return [..._paths];
  },

  reset() {
    this.resetSession();
  }
};


// Forçage de la visibilité globale
if (typeof window !== 'undefined') {
    window.WhiteboardService = WhiteboardService;
    console.log("🚀 WhiteboardService exposé globalement sur window");
}
