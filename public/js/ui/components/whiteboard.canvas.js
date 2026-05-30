import { WhiteboardTools } from "/js/domains/whiteboard/whiteboard.tools.js";
export class WhiteboardCanvas {
  constructor(canvasId, whiteboardService, options = {}) {
    this.canvas            = document.getElementById(canvasId);
    this.ctx               = this.canvas.getContext("2d");
    this.whiteboardService = whiteboardService;
    this.colorPicker       = options.colorPicker || null;
    this.sizeSlider        = options.sizeSlider  || null;

    this._drawing     = false;
    this._currentTool = "pen"; // outil par défaut

    this.resizeCanvas();

    this._initEvents();

    this._boundResize = this.resizeCanvas.bind(this);
    window.addEventListener("resize", this._boundResize);
    this._sessionId = options.sessionId || null;
    this._disposed = false;
    this._rulerStart = null;
    this._tools = new WhiteboardTools(this.canvas, this.ctx, {
  getColor:   () => this._getColor(),
  getSize:    () => this._getSize(),
  getTool:    () => this._currentTool,
  redraw:     () => this.redraw(),
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
  // TOOL SETTER
  // ============================

  setTool(tool) {
    this._currentTool = tool;
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
      const pos = this._getCanvasPos(e);
      this._drawing = true;
       
       if (this._tools.onPointerDown(pos)) return;
       if (this._currentTool === "ruler") {
        this._rulerStart = pos;
        return;
      }
     
if (this._currentTool === "point") {
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
        tool:  this._currentTool,
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
        this.redraw(); // clean preview

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

  redraw() {
    const paths = this.whiteboardService.getPaths();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const path of paths) {
      if (!path.points?.length) continue;
      this._drawPath(path);
    }
  }
    _drawPath(path) {
 if (["line", "rect", "text", "circle"].includes(path.tool)) {
  this._tools.drawRemotePath(path);
  return;
}
if (path.tool === "point") {
  const ctx = this.ctx;
  ctx.beginPath();
  ctx.arc(path.points[0].x, path.points[0].y, (path.size || 3) / 2, 0, Math.PI * 2);
  ctx.fillStyle = path.color || "#000";
  ctx.fill();
  return;
}
  const ctx = this.ctx;
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

  // ✅ Toujours remettre source-over après chaque path
  ctx.globalCompositeOperation = "source-over";
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

 resizeCanvas() {
  if (this._disposed) return;

  const wrapper = this.canvas.parentElement;
  const rect = wrapper?.getBoundingClientRect() ?? this.canvas.getBoundingClientRect();
  // Protection anti-boucle : ignorer si taille irréaliste
  if (rect.width < 100 || rect.height < 100) return;
  const dpr = window.devicePixelRatio || 1;
  this.canvas.width  = rect.width  * dpr;
  this.canvas.height = rect.height * dpr;

  this.ctx.setTransform(1, 0, 0, 1, 0, 0);
  this.ctx.scale(dpr, dpr);

  this.redraw();
}

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  destroy() {
    window.removeEventListener("resize", this._boundResize);
    this._onResize = null;
    this.whiteboardService = null;
    this.canvas = null;
    this.ctx = null;
  }
}