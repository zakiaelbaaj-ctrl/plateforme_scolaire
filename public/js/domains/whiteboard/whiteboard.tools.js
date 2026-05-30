// ======================================================
// WHITEBOARD TOOLS — Ligne, Rectangle, Texte
// /js/domains/whiteboard/whiteboard.tools.js
// ======================================================
// ✅ Aucune dépendance framework
// ✅ Utilisé par prof, élève ET étudiant
// ✅ S'intègre dans WhiteboardCanvas via initTools()
// ======================================================

export class WhiteboardTools {

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} options
   * @param {Function} options.getColor   — retourne la couleur active
   * @param {Function} options.getSize    — retourne l'épaisseur active
   * @param {Function} options.getTool    — retourne l'outil actif
   * @param {Function} options.onPathDone — appelé quand un tracé est terminé (line, rect)
   * @param {Function} options.onText     — appelé quand un texte est validé
   * @param {Function} options.redraw     — redessine tout le canvas
   */
  constructor(canvas, ctx, options = {}) {
    this._canvas   = canvas;
    this._ctx      = ctx;
    this._getColor = options.getColor  ?? (() => "#000000");
    this._getSize  = options.getSize   ?? (() => 3);
    this._getTool  = options.getTool   ?? (() => "pen");
    this._onPathDone = options.onPathDone ?? (() => {});
    this._onText     = options.onText     ?? (() => {});
    this._redraw     = options.redraw     ?? (() => {});

    // État interne
    this._startPos   = null;
    this._isDrawing  = false;
    this._textInput  = null; // input DOM flottant pour l'outil texte
  }

  // ============================
  // API PUBLIQUE
  // ============================

  /**
   * Appeler au pointerdown — démarre le tracé si outil géré ici
   * @returns {boolean} true si l'event est consommé par cet outil
   */
  onPointerDown(pos) {
    const tool = this._getTool();

    if (tool === "line" || tool === "rect" || tool === "circle") {
  this._startPos  = pos;
  this._isDrawing = true;
  return true;
}
    if (tool === "text") {
      this._showTextInput(pos);
      return true;
    }

    return false; // pas géré ici → WhiteboardCanvas gère pen/eraser/ruler
  }

  /**
   * Appeler au pointermove — prévisualise le tracé
   * @returns {boolean} true si consommé
   */
  onPointerMove(pos) {
    const tool = this._getTool();
    if (!this._isDrawing || !this._startPos) return false;
   if (tool !== "line" && tool !== "rect" && tool !== "circle") return false;
    // Redessine tout + aperçu en temps réel
    this._redraw();
    this._drawPreview(tool, this._startPos, pos);
    return true;
  }

  /**
   * Appeler au pointerup — finalise et émet le tracé
   * @returns {boolean} true si consommé
   */
  onPointerUp(pos) {
    const tool = this._getTool();
    if (!this._isDrawing || !this._startPos) return false;
    if (tool !== "line" && tool !== "rect" && tool !== "circle") return false;

    this._isDrawing = false;

    // Redessine proprement (sans preview)
    this._redraw();

    // Construit le path normalisé
    const path = this._buildPath(tool, this._startPos, pos);
    this._startPos = null;

    // Notifie WhiteboardService
    this._onPathDone(path);
    return true;
  }

  /**
   * Dessine un path reçu du réseau (line ou rect)
   */
  drawRemotePath(path) {
    if (path.tool === "line") {
      this._drawLine(
        this._ctx,
        path.points[0],
        path.points[path.points.length - 1],
        path.color,
        path.size
      );
    } else if (path.tool === "rect") {
      this._drawRect(
        this._ctx,
        path.points[0],
        path.points[path.points.length - 1],
        path.color,
        path.size
      );
      } else if (path.tool === "circle") {
       this._drawCircle(
       this._ctx,
      path.points[0],
       path.points[path.points.length - 1],
      path.color,
      path.size
     );
    } else if (path.tool === "text") {
      this._drawText(
        this._ctx,
        path.text,
        path.points[0],
        path.color,
        path.size
      );
    }
  }

  /**
   * Annule le tracé en cours (ex: pointercancel)
   */
  cancel() {
    this._isDrawing = false;
    this._startPos  = null;
    this._removeTextInput();
  }

  // ============================
  // PREVIEW (pointermove)
  // ============================

  _drawPreview(tool, start, end) {
    const ctx = this._ctx;
    ctx.save();
    ctx.setLineDash([6, 3]); // pointillés pour l'aperçu
    if (tool === "line") {
      this._drawLine(ctx, start, end, this._getColor(), this._getSize());
    } else if (tool === "rect") {
      this._drawRect(ctx, start, end, this._getColor(), this._getSize());
    } else if (tool === "circle") {
    this._drawCircle(ctx, start, end, this._getColor(), this._getSize());
    }
    ctx.restore();
  }

  // ============================
  // DRAW PRIMITIVES
  // ============================

  _drawLine(ctx, start, end, color, size) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = size;
    ctx.lineCap     = "round";
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x,   end.y);
    ctx.stroke();
  }

  _drawRect(ctx, start, end, color, size) {
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = size;
    ctx.strokeRect(
      start.x,
      start.y,
      end.x - start.x,
      end.y - start.y
    );
  }
  _drawCircle(ctx, start, end, color, size) {
  const cx     = (start.x + end.x) / 2;
  const cy     = (start.y + end.y) / 2;
  const rx     = Math.abs(end.x - start.x) / 2;
  const ry     = Math.abs(end.y - start.y) / 2;
  const radius = Math.max(rx, ry); // cercle parfait basé sur le plus grand rayon

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth   = size;
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}
  _drawText(ctx, text, pos, color, size) {
    if (!text) return;
    const fontSize = Math.max(12, size * 5);
    ctx.font      = `${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(text, pos.x, pos.y);
  }

  // ============================
  // BUILD PATH (pour WhiteboardService)
  // ============================

  _buildPath(tool, start, end) {
    return {
      id:        crypto.randomUUID(),
      tool,
      color:     this._getColor(),
      size:      this._getSize(),
      points:    [start, end],
      timestamp: Date.now()
    };
  }

  // ============================
  // OUTIL TEXTE — input DOM flottant
  // ============================

  _showTextInput(pos) {
    this._removeTextInput(); // évite les doublons

    const rect  = this._canvas.getBoundingClientRect();
    const input = document.createElement("input");
    input.type        = "text";
    input.placeholder = "Tapez votre texte…";
    input.style.cssText = `
      position:   fixed;
      left:       ${rect.left + pos.x}px;
      top:        ${rect.top  + pos.y - 20}px;
      z-index:    9999;
      font-size:  ${Math.max(12, this._getSize() * 5)}px;
      color:      ${this._getColor()};
      background: rgba(255,255,255,0.92);
      border:     2px solid ${this._getColor()};
      border-radius: 4px;
      padding:    2px 6px;
      outline:    none;
      min-width:  120px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    `;

    document.body.appendChild(input);
    input.focus();
    this._textInput = input;

    const commit = () => {
      const text = input.value.trim();
      this._removeTextInput();
      if (!text) return;

      // Dessine localement
      this._drawText(this._ctx, text, pos, this._getColor(), this._getSize());

      // Construit le path texte et notifie
      const path = {
        id:        crypto.randomUUID(),
        tool:      "text",
        text,
        color:     this._getColor(),
        size:      this._getSize(),
        points:    [pos],
        timestamp: Date.now()
      };
      this._onText(path);
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  { e.preventDefault(); commit(); }
      if (e.key === "Escape") { this._removeTextInput(); }
    });

    input.addEventListener("blur", commit);
  }

  _removeTextInput() {
    if (this._textInput) {
      this._textInput.remove();
      this._textInput = null;
    }
  }
}