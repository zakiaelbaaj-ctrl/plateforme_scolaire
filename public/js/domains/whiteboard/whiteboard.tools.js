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
    this._previewPending = false;
    this._textInput  = null; // input DOM flottant pour l'outil texte
  }

  // ============================
  // API PUBLIQUE
  // ============================

  /**
   * Appeler au pointerdown — démarre le tracé si outil géré ici
   * @returns {boolean} true si l'event est consommé par cet outil
   */
  onPointerDown(pos, tool) {
  const activeTool = tool ?? this._getTool();
  if (activeTool === "line" || activeTool === "rect" || activeTool === "circle") {
    this._startPos  = pos;
    this._isDrawing = true;
    // ✅ Snapshot du canvas AVANT tout tracé de preview
    this._snapshot = this._ctx.getImageData(
      0, 0,
      this._canvas.width,
      this._canvas.height
    );
    return true;
  }
  if (activeTool === "text") {
    this._showTextInput(pos);
    return true;
  }
  return false;
}
  /**
   * Appeler au pointermove — prévisualise le tracé
   * @returns {boolean} true si consommé
   */
  onPointerMove(pos) {
  const tool = this._getTool();
  if (!this._isDrawing || !this._startPos) return false;
  if (tool !== "line" && tool !== "rect" && tool !== "circle") return false;
  if (this._previewPending) return true;

  this._previewPending = true;
  const capturedPos = { x: pos.x, y: pos.y }; // ✅ capturer pos pour le RAF

  requestAnimationFrame(() => {
    this._previewPending = false;
    if (!this._isDrawing) return;

    // ✅ Restaurer le snapshot au lieu de redessiner tous les paths (O(1) vs O(n))
    if (this._snapshot) {
      this._ctx.putImageData(this._snapshot, 0, 0);
    }
    this._drawPreview(tool, this._startPos, capturedPos);
  });

  return true;
}
  /**
   * Appeler au pointerup — finalise et émet le tracé
   * @returns {boolean} true si consommé
   */
  // AVANT
onPointerUp(pos) {
  const tool = this._getTool();
  if (!this._isDrawing || !this._startPos) return false;
  if (tool !== "line" && tool !== "rect" && tool !== "circle") return false;

  this._isDrawing = false;
  this._snapshot  = null;

  this._redraw(); // ❌ redessine tous les paths inutilement

  const path = this._buildPath(tool, this._startPos, pos);
  this._startPos = null;
  this._onPathDone(path);
  return true;
}

// APRÈS
onPointerUp(pos) {
  const tool = this._getTool();
  if (!this._isDrawing || !this._startPos) return false;
  if (tool !== "line" && tool !== "rect" && tool !== "circle") return false;

  this._isDrawing      = false;
  this._snapshot       = null; // ✅ libérer mémoire
  this._previewPending = false; // ✅ annuler RAF en attente

  // ✅ PAS de _redraw() ici — c'est _onPathDone → commitPath → drawPath qui s'en charge
  const path = this._buildPath(tool, this._startPos, pos);
  this._startPos = null;
  this._onPathDone(path);
  return true;
}
  /**
   * Dessine un path reçu du réseau (line ou rect)
   */
 drawRemotePath(path) {
    // 1. Sécurité structurelle : si pas de points ou tableau vide, on stoppe direct
    if (!path || !path.points || path.points.length < 1) {
      console.warn("⚠️ drawRemotePath: tentative de dessin sans points valides", path);
      return;
    }

    // 2. Sécurité d'état du Canvas
    this._ctx.globalCompositeOperation = "source-over";

    // 3. Extraction sécurisée du point de départ et de fin
    const startPoint = path.points[0];
    // S'il n'y a qu'un point (ex: clic sans mouvement), on clone le premier point pour éviter le undefined
    const endPoint   = path.points.length > 1 ? path.points[path.points.length - 1] : path.points[0];

    // 4. Routage vers les primitives isolées
    if (path.tool === "line") {
      this._drawLine(this._ctx, startPoint, endPoint, path.color, path.size);
    } 
    else if (path.tool === "rect") {
      this._drawRect(this._ctx, startPoint, endPoint, path.color, path.size);
    } 
    else if (path.tool === "circle") {
      this._drawCircle(this._ctx, startPoint, endPoint, path.color, path.size);
    } 
    else if (path.tool === "text") {
      this._drawText(this._ctx, path.text, startPoint, path.color, path.size);
    }
  }

  /**
   * Annule le tracé en cours (ex: pointercancel)
   */
 cancel() {
  this._isDrawing = false;
  this._startPos  = null;
  this._previewPending = false;
  this._snapshot  = null; // ✅ ajouter cette ligne
  this._removeTextInput();
  if (this._ctx) {
    this._ctx.beginPath();
  }
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
  // DRAW PRIMITIVES (Sécurisées)
  // ============================

  _drawLine(ctx, start, end, color, size) {
    ctx.save(); // 🔒 Sauvegarde l'état du contexte (évite la contamination du lineDash)
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = size;
    ctx.lineCap     = "round";
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x,   end.y);
    ctx.stroke();
    ctx.beginPath(); // 🧼 Nettoie le tampon de tracé
    ctx.restore(); // 🔓 Restaure l'état d'origine
  }

  _drawRect(ctx, start, end, color, size) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = size;
    ctx.strokeRect(
      start.x,
      start.y,
      end.x - start.x,
      end.y - start.y
    );
    ctx.beginPath(); // 🧼 Nettoie le tampon de tracé
    ctx.restore();
  }

  _drawCircle(ctx, start, end, color, size) {
    const cx     = (start.x + end.x) / 2;
    const cy     = (start.y + end.y) / 2;
    const rx     = Math.abs(end.x - start.x) / 2;
    const ry     = Math.abs(end.y - start.y) / 2;
    const radius = Math.max(rx, ry);

    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = size;
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath(); // 🧼 Nettoie le tampon de tracé
    ctx.restore();
  }

  _drawText(ctx, text, pos, color, size) {
    if (!text) return;
    ctx.save();
    ctx.beginPath(); // Isolation complète
    const fontSize = Math.max(12, size * 5);
    ctx.font      = `${fontSize}px sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(text, pos.x, pos.y);
    ctx.beginPath();
    ctx.restore();
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
  this._removeTextInput();
  const isFullscreen = !!document.fullscreenElement;
  const input = document.createElement("input");
  input.type        = "text";
  input.placeholder = "Tapez votre texte…";

  if (isFullscreen) {
    const fsRect = document.fullscreenElement.getBoundingClientRect();
    input.style.cssText = `
      position:   absolute;
      left:       ${pos.x}px;
      top:        ${pos.y - 20}px;
      z-index:    99999;
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
    document.fullscreenElement.appendChild(input);
  } else {
    const rect = this._canvas.getBoundingClientRect();
    input.style.cssText = `
      position:   fixed;
      left:       ${rect.left + pos.x}px;
      top:        ${rect.top  + pos.y - 20}px;
      z-index:    99999;
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
  }

  input.focus();
  this._textInput = input;
  
  let committed = false;

  const commit = () => {
    if (committed) return;      // 👈 AJOUT : bloque tout appel ultérieur
    committed = true;           // 👈 AJOUT

    const text = input.value.trim();
    this._removeTextInput();
    if (!text) return;

    this._drawText(this._ctx, text, pos, this._getColor(), this._getSize());

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
    if (e.key === "Escape") {
  

  committed = true;         // 👈 AJOUT : empêche un blur de commit() après Escape aussi
      this._removeTextInput();
    }
  });


  input.addEventListener("blur", commit);
}
  _removeTextInput() {
  if (this._textInput) {
    try {
      this._textInput.remove();
    } catch (e) {
      // Déjà supprimé — ignoré
    }
    this._textInput = null;
  }
}
}