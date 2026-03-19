// ======================================================
// WHITEBOARD CANVAS — UI PURE
// /js/ui/components/whiteboard.canvas.js
// ======================================================
// ✅ Aucune logique métier
// ✅ Délègue tout à WhiteboardService
// ✅ Compatible avec getPaths() → { points[], color, size }
// ======================================================

export class WhiteboardCanvas {

  constructor(canvasId, whiteboardService, options = {}) {
    this.canvas             = document.getElementById(canvasId);
    this.ctx                = this.canvas.getContext("2d");
    this.whiteboardService  = whiteboardService;
    this.colorPicker        = options.colorPicker || null;
    this.sizeSlider         = options.sizeSlider  || null;

    this._drawing = false;
    this._initEvents();
  }


  // ============================
  // EVENTS SOURIS
  // ============================

  _initEvents() {

    this.canvas.addEventListener("mousedown", (e) => {
      this._drawing = true;
      this.whiteboardService.startPath({
        x:     e.offsetX,
        y:     e.offsetY,
        color: this._getColor(),
        size:  this._getSize()
      });
      // ✅ Démarre le trait visuellement
      this.ctx.beginPath();
      this.ctx.moveTo(e.offsetX, e.offsetY);
    });

    this.canvas.addEventListener("mousemove", (e) => {
      if (!this._drawing) return;
      this.whiteboardService.addPoint({ x: e.offsetX, y: e.offsetY });
      // ✅ Dessine en temps réel
      this._drawSegment(e.offsetX, e.offsetY);
    });

    this.canvas.addEventListener("mouseup", () => {
      if (!this._drawing) return;
      this._drawing = false;
      this.whiteboardService.endPath();
    });

    // ✅ Ferme aussi le path si la souris quitte le canvas
    this.canvas.addEventListener("mouseleave", () => {
      if (!this._drawing) return;
      this._drawing = false;
      this.whiteboardService.endPath();
    });
  }


  // ============================
  // DESSIN TEMPS RÉEL
  // ============================

  _drawSegment(x, y) {
    this.ctx.lineCap     = "round";
    this.ctx.strokeStyle = this._getColor();
    this.ctx.lineWidth   = this._getSize();
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
  }


  // ============================
  // REDRAW COMPLET — depuis getPaths()
  // ============================

  redraw() {
    const paths = this.whiteboardService.getPaths();
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (const path of paths) {
      if (!path.points?.length) continue;
      this._drawPath(path);
    }
  }

  // ✅ Dessine un path complet { points[], color, size }
  _drawPath(path) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.strokeStyle = path.color || "#000";
    ctx.lineWidth   = path.size  || 3;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";

    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) {
      ctx.lineTo(path.points[i].x, path.points[i].y);
    }
    ctx.stroke();
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

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}