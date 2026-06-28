// ======================================================
// WHITEBOARD DOMAIN SERVICE
// /js/domains/whiteboard/whiteboard.service.js
// ======================================================

import { AppState }                           from "/js/core/state.js";
import { socketService }                      from "/js/core/socket.service.js";
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
      this._canvas = new WhiteboardCanvas(canvasId, this, {
        colorPicker: options.colorPicker ?? document.getElementById("whiteboardColor"),
        sizeSlider:  options.sizeSlider  ?? document.getElementById("whiteboardSize")
      });

      this.onStroke((path) => {
  if (!this._canvas) return;
  // Dessine uniquement le nouveau path — pas de redraw complet
  if (typeof this._canvas.drawPath === "function") {
    this._canvas.drawPath(path);
   } else {
    // Fallback au cas où drawPath n'existe pas, mais attention au coût CPU
          this._canvas.redraw?.();
        }
      });

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
    if (!data) return;
    switch (data.type) {

      case WhiteboardEvents.TABLEAU_STROKE: {
        const path = data.path ?? data.stroke;

        if (!path) {
          console.warn("⚠️ tableauStroke reçu sans path/stroke", data);
          break;
        }

        // 🛡️ Sécurité anti-doublon / anti-écho réseau
        if (!_paths.find(p => p.id === path.id)) {
          _paths.push(path);
          _undoStack.push(path);
          _redoStack = [];
          _paths.sort((a, b) => a.timestamp - b.timestamp);
          // ✅ On ne déclenche le rendu incrémental QUE si le path est nouveau
          _cb.stroke?.(path);
        } else {
        }
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
       case "tableauUndo":
      case WhiteboardEvents.TABLEAU_UNDO: {
        const targetAuthorId = data.authorId ?? data.userId ?? data.id;
        const idx = [..._undoStack].reverse().findIndex(p => String(p.authorId) === String(targetAuthorId));
        if (idx === -1) break;
        const path = _undoStack.splice(_undoStack.length - 1 - idx, 1)[0];
        _redoStack.push(path);
        _paths = _paths.filter(p => p.id !== path.id);
        _cb.undo?.(path);
        this._canvas?.redraw?.(); // 🔄 Redraw nécessaire pour masquer le path annulé
        break;
      }
       case "tableauRedo":
       case WhiteboardEvents.TABLEAU_REDO: {
        const targetAuthorId = data.authorId ?? data.userId ?? data.id;
        const idx = [..._redoStack].reverse().findIndex(p => p.authorId === data.authorId);
        if (idx === -1) break;
        const path = _redoStack.splice(_redoStack.length - 1 - idx, 1)[0];
        _undoStack.push(path);
        _paths.push(path);
        _cb.redo?.(path);
        this._canvas?.redraw?.(); // 🔄 Redraw nécessaire pour réafficher le path rétabli
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
      // 🌐 Envoi direct et unique via WebSocket
      const payload = typeof WhiteboardPayloadFactory.createClear === "function"
        ? WhiteboardPayloadFactory.createClear(AppState.currentRoomId)
        : { type: "tableauClear", roomId: AppState.currentRoomId };

      socketService.send(payload);
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
    _currentPath = null;

    _paths.push(path);
    _undoStack.push(path);
    _redoStack = [];

    _cb.stroke?.(path);
    // 🌐 Forcer l'utilisation de la WebSocket
      socketService.send(WhiteboardPayloadFactory.createStroke(path, AppState.currentRoomId));
  },
 commitPath(path) {
    if (!path) return;

    // 🛡️ Sécurité anti-écho : on s'assure que le tracé est signé localement
    if (!path.authorId) {
      path.authorId = _myUserId;
    }

    // Deep clone de sécurité
    const pathClone = JSON.parse(JSON.stringify(path));
    _paths.push(pathClone);
    _undoStack.push(pathClone);
    _redoStack = [];
    _cb.stroke?.(pathClone);

    // 🌐 Envoi exclusif via WebSocket
    socketService.send(
      WhiteboardPayloadFactory.createStroke(pathClone, AppState.currentRoomId)
    );
  },

  sendText(textStroke) {
    if (!textStroke || !_myUserId) return;
    if (!textStroke.authorId) textStroke.authorId = _myUserId;

    // 🌐 Tout passe par la socket centrale
    socketService.send(WhiteboardPayloadFactory.createText(textStroke, AppState.currentRoomId));
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
    const idx = [..._undoStack].reverse().findIndex(p => String(p.authorId) === String(_myUserId));
    if (idx === -1) return;
    const path = _undoStack.splice(_undoStack.length - 1 - idx, 1)[0];
    _redoStack.push(path);
    _paths = _paths.filter(p => p.id !== path.id);

    // 🎨 Forcer le rafraîchissement visuel du tableau suite à l'annulation
    this._canvas?.redraw?.();
    _cb.undo?.(path);

    // 🌐 Notification au serveur via WebSocket
    socketService.send(WhiteboardPayloadFactory.createUndo(_myUserId, AppState.currentRoomId));
  },

  redo() {
    const idx = [..._redoStack].reverse().findIndex(p => p.authorId === _myUserId);
    if (idx === -1) return;
    const path = _redoStack.splice(_redoStack.length - 1 - idx, 1)[0];
    _undoStack.push(path);
    _paths.push(path);

    // 🎨 Forcer le rafraîchissement visuel du tableau suite au rétablissement
    this._canvas?.redraw?.();
    _cb.redo?.(path);

    // 🌐 Notification au serveur via WebSocket
    socketService.send(WhiteboardPayloadFactory.createRedo(_myUserId, AppState.currentRoomId));
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