import { WhiteboardTools } from "/js/domains/whiteboard/whiteboard.tools.js";
export class WhiteboardCanvas {
  constructor(canvasId, whiteboardService, options = {}) {
    this.canvas            = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d", { willReadFrequently: true }); // ✅
    this.whiteboardService = whiteboardService;
    this.colorPicker       = options.colorPicker || null;
    this.sizeSlider        = options.sizeSlider  || null;

    this._drawing     = false;
    this._currentTool = "pen"; // outil par défaut
    this._toolJustChanged = false;
    this._toolChangedTimer = null;
    this._disposed   = false;
    this._rulerStart = null;
    // ✅ Initialiser le flag AVANT resizeCanvas et ResizeObserver
  this._inFullscreenTransition    = false;
  this._fullscreenTransitionTimer = null;
  this._onFullscreenChange = () => {
    this._inFullscreenTransition = true;
    clearTimeout(this._fullscreenTransitionTimer);
    this._fullscreenTransitionTimer = setTimeout(() => {
      this._inFullscreenTransition = false;
      this.resizeCanvas();
    }, 500); // ✅ 500ms pour couvrir toutes les transitions
  };
  document.addEventListener("fullscreenchange", this._onFullscreenChange);

    this.resizeCanvas();

    this._initEvents();
    const debouncedResize = this._debounce(this.resizeCanvas.bind(this), 600);
    this._resizeObserver = new ResizeObserver(debouncedResize);
    this._resizeObserver.observe(this.canvas.parentElement);
    this._sessionId  = options.sessionId || null;
    

    this._tools = new WhiteboardTools(this.canvas, this.ctx, {
  getColor:   () => this._getColor(),
  getSize:    () => this._getSize(),
  getTool:    () => this._currentTool,
  redraw:      () => this.requestRedraw(),
  // Dans whiteboard.canvas.js — onPathDone simplifié
  onPathDone: (path) => {
  this.whiteboardService.commitPath(path); // ✅ méthode à ajouter dans WhiteboardService
},
onText: (path) => {
  this.whiteboardService.commitPath(path); // ✅ même méthode
}
});
  }
  // ============================
  // EXPOSITION DE LA METHODE DE TRACÉ UNIQUE (RENDU INCRÉMENTAL)
  // ============================
  
  /**
   * Appelé par WhiteboardService lors de la réception d'un seul tracé distant.
   * Évite le recalcul complet de l'historique (O(1)).
   */
  drawPath(path) {
    if (this._disposed || !path) return;
    this._drawPath(path);
  }

  // ============================
  // TOOL SETTER
  // ============================

  setTool(tool) {
    this._currentTool = tool;
    this._toolJustChanged = true;
    // ✅ Sécurité : si aucun pointerdown ne suit dans les 300ms,
  // on remet le flag à false pour ne pas bloquer le prochain vrai clic
  clearTimeout(this._toolChangedTimer);
  this._toolChangedTimer = setTimeout(() => {
    this._toolJustChanged = false;
  }, 300);
    if (this._tools) {
    if (typeof this._tools.reset === "function") {
      this._tools.reset();
    } else if (typeof this._tools.cancel === "function") {
      this._tools.cancel();
    }
    if (this._tools.currentShape) this._tools.currentShape = null;
    if (this._tools.activePath)  this._tools.activePath = null;
  }
}

  // ============================
  // HELPER COORDONNEES
  // ============================

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  // ============================
  // EVENTS
  // ============================

  _initEvents() {
    const start = (e) => {
      e.preventDefault();
      if (this._toolJustChanged) {
    this._toolJustChanged = false;
    return;
  }
      const pos = this._getCanvasPos(e);
      this._drawing = true;
      const tool = this._currentTool;
       
       if (this._tools.onPointerDown(pos, tool)) return;
        if (tool === "ruler") {
        this._rulerStart = pos;
        return;
      }
     
if (tool === "point") {
  const color = this._getColor();
  const size  = this._getSize();
  const ctx   = this.ctx;

  ctx.beginPath();
  ctx.arc(pos.x, pos.y, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Émettre comme un path d'un seul point
  this.whiteboardService.commitPath({
    id:        crypto.randomUUID(),
    tool:      "point",
    color,
    size,
    points:    [pos],
    timestamp: Date.now()
  });
  return;
}
      this.whiteboardService.startPath({
        x:     pos.x,
        y:     pos.y,
        tool,
        color: this._getColor(),
        size:  this._getSize()
      });

      // snapshot couleur/taille pour tout le tracé courant
      this._activeColor = this._getColor();
      this._activeSize  = this._getSize();

      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
    };

    const move = (e) => {
      if (!this._drawing) return;
      e.preventDefault();

      const pos = this._getCanvasPos(e);
      if (this._tools.onPointerMove(pos)) return;
      if (this._currentTool === "ruler" && this._rulerStart) {
        this.requestRedraw();

        const ctx = this.ctx;
        ctx.beginPath();
        ctx.lineCap = "round";
        ctx.strokeStyle = this._getColor();
        ctx.lineWidth = this._getSize();
        ctx.moveTo(this._rulerStart.x, this._rulerStart.y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        return;
      }

      this.whiteboardService.addPoint({ x: pos.x, y: pos.y });
      this._drawSegment(pos.x, pos.y);

      // reset mode pour éviter bugs futurs
      this.ctx.globalCompositeOperation = "source-over";
    };

    // ✅ end est au bon niveau — accessible par tous les listeners
    const end = (e) => {
      if (!this._drawing) return;
      this._drawing = false;

      const pos = this._getCanvasPos(e);
       if (this._tools.onPointerUp(pos)) return;
       if (this._currentTool === "ruler" && this._rulerStart) {
        this.whiteboardService.startPath({
          x:     this._rulerStart.x,
          y:     this._rulerStart.y,
          tool:  "line",
          color: this._getColor(),
          size:  this._getSize()
        });

        this.whiteboardService.addPoint(pos);
        this.whiteboardService.endPath();

        this._rulerStart = null;
        return;
      }

      this.whiteboardService.endPath();
    };

    // Pointer Events (desktop + mobile + stylet)
    this.canvas.style.touchAction = "none";

    this.canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        this.canvas.setPointerCapture(e.pointerId);
      }
      start(e);
    });

    this.canvas.addEventListener("pointermove", move);
    this.canvas.addEventListener("pointerup",     end);
    this.canvas.addEventListener("pointerleave",  end);
    this.canvas.addEventListener("pointercancel", end);
  }

  // ============================
  // DESSIN TEMPS REEL
  // ============================

  _drawSegment(x, y) {
    const ctx = this.ctx;

    ctx.lineCap  = "round";
    ctx.lineJoin = "round";

    if (this._currentTool === "eraser") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = this._activeColor;
    }

    ctx.lineWidth = this._activeSize;
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  // ============================
  // REDRAW COMPLET

  // ============================
  _needsRedraw = false; // flag de debounce RAF
  _isRedrawing = false;
requestRedraw() {
  if (this._needsRedraw) return; // déjà schedulé → ignoré
  this._needsRedraw = true;
  requestAnimationFrame(() => {
    this._needsRedraw = false;
    if (!this._isRedrawing) { // ✅ ne pas s'empiler sur un redraw en cours
      this.redraw();
    }
  });
  }
 redraw() {
  if (this._isRedrawing) return; // ✅ guard anti-récursion
  this._isRedrawing = true;
  
  if (this._disposed) return;

  const paths = this.whiteboardService.getPaths();
  if (!paths) {
    this._isRedrawing = false;
    return;
  }

  this.ctx.globalCompositeOperation = "source-over";
  this.ctx.lineCap = "round";
  this.ctx.lineJoin = "round";
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

  for (const path of paths) {
    if (!path || !path.points || !path.points.length) continue;
    this._drawPath(path);
  }

  this._isRedrawing = false; // ✅ libérer à la fin
}
   _drawPath(path) {
  if (!path || !path.tool) return;

  // 1. Si c'est un outil géré par WhiteboardTools, on délègue et ON COUPE DIRECTEMENT LE CODE ICI
  if (["line", "rect", "text", "circle"].includes(path.tool)) {
    this._tools.drawRemotePath(path);
    // Rétablir le mode normal au cas où WhiteboardTools l'altère
      this.ctx.globalCompositeOperation = "source-over";
    return;
  }

  // 2. Si c'est un point unique
  if (path.tool === "point") {
    if (!path.points || !path.points[0]) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.arc(path.points[0].x, path.points[0].y, (path.size || 3) / 2, 0, Math.PI * 2);
    ctx.fillStyle = path.color || "#000";
    ctx.fill();
    ctx.restore();
    return;
  }

  // 3. Sécurité : Si l'outil n'est ni un pen ni un eraser à ce stade, on ignore pour éviter la contamination
  if (path.tool !== "pen" && path.tool !== "eraser") return;

  // 4. Tracé exclusif pour "pen" et "eraser"
  const ctx = this.ctx;
  ctx.save();
  ctx.beginPath();
  ctx.lineCap  = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = path.size || 3;
  
  if (path.tool === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0,0,0,1)";
  } else {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = path.color || "#000";
  }

  ctx.moveTo(path.points[0].x, path.points[0].y);
  for (let i = 1; i < path.points.length; i++) {
    ctx.lineTo(path.points[i].x, path.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}
  // ============================
  // HELPERS
  // ============================

  _getColor() {
    return this.colorPicker?.value ?? "#000000";
  }

  _getSize() {
    return this.sizeSlider ? parseInt(this.sizeSlider.value) : 3;
  }
 _debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }
 resizeCanvas() {
  if (this._disposed) return;
  if (this._inFullscreenTransition) return; // ✅ ignorer pendant la transition
  const wrapper = this.canvas.parentElement;
  const rect = wrapper?.getBoundingClientRect() ?? this.canvas.getBoundingClientRect();
  if (rect.width < 100 || rect.height < 100) return;
  const dpr = window.devicePixelRatio || 1;
  const newW = Math.round(rect.width  * dpr);
  const newH = Math.round(rect.height * dpr);
  if (this.canvas.width === newW && this.canvas.height === newH) {
    return;
  }
  this.canvas.width  = newW;
  this.canvas.height = newH;
  this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  this.ctx.scale(dpr, dpr);
  this.requestRedraw(); // ✅ dédupliqué via RAF
}

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
  this._disposed = true;
  this._resizeObserver?.disconnect();
  document.removeEventListener("fullscreenchange", this._onFullscreenChange); // ✅
  clearTimeout(this._fullscreenTransitionTimer); // ✅
  this._resizeObserver = null;
  this._onResize = null;
  this.whiteboardService = null;
  this.canvas = null;
  this.ctx = null;
}
}