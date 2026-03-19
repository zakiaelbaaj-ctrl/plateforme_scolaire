// ======================================================
// WHITEBOARD CORE — MOTEUR CANVAS + ZOOM/PAN
// ======================================================

import { WhiteboardState } from "/js/modules/whiteboard/whiteboard.state.js";
import { WhiteboardSocket } from "/js/modules/whiteboard/whiteboard.socket.js";

export const WhiteboardCore = {

  // --------------------------------------------------
  // INTERNAL
  // --------------------------------------------------
  _eventsBound: false,

  // Vue (zoom/pan)
  view: {
    scale: 1,
    minScale: 0.5,
    maxScale: 3,
    offsetX: 0,
    offsetY: 0
  },

  isPanning: false,
  panStart: { x: 0, y: 0 },

  lastTouchDistance: null,
  lastTouchCenter: null,

  // --------------------------------------------------
  // INIT
  // --------------------------------------------------
  init(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
      console.warn("WhiteboardCore.init → canvas introuvable:", canvasId);
      return;
    }

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    WhiteboardState.canvas = canvas;
    WhiteboardState.ctx = canvas.getContext("2d");

    if (!WhiteboardState.ctx) {
      console.error("WhiteboardCore.init → impossible d'obtenir le contexte 2D");
      return;
    }

    WhiteboardState.ctx.setTransform(1, 0, 0, 1, 0, 0);

// 🛡 Empêche le double binding des événements
if (!this._eventsBound) {
  this.bindEvents();
  this._eventsBound = true;
}

console.log("📝 WhiteboardCore initialisé sur", canvasId);

  },

  // --------------------------------------------------
  // EVENTS
  // --------------------------------------------------
  bindEvents() {
    const canvas = WhiteboardState.canvas;
    if (!canvas) return;

    // SOURIS — dessin
    canvas.addEventListener("mousedown", (e) => {
      // bouton gauche → dessin
      if (e.button === 0) {
        this.startDraw(e);
      }
      // bouton milieu ou droit → pan
      if (e.button === 1 || e.button === 2) {
        this.startPan(e);
      }
    });

    canvas.addEventListener("mousemove", (e) => {
      this.draw(e);
      this.pan(e);
    });

    canvas.addEventListener("mouseup", () => {
      this.stopDraw();
      this.stopPan();
    });

    canvas.addEventListener("mouseleave", () => {
      this.stopDraw();
      this.stopPan();
    });

    // TACTILE — dessin simple
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          this.startDraw(this._touchToMouseEvent(e.touches[0]));
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 1) {
          e.preventDefault();
          this.draw(this._touchToMouseEvent(e.touches[0]));
        } else if (e.touches.length === 2) {
          e.preventDefault();
          this.handlePinchZoom(e);
        }
      },
      { passive: false }
    );

    canvas.addEventListener(
      "touchend",
      (e) => {
        e.preventDefault();
        this.stopDraw();
        this.lastTouchDistance = null;
        this.lastTouchCenter = null;
      }
    );

    // ZOOM MOLETTE
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this.handleWheelZoom(e);
      },
      { passive: false }
    );
  },

  _touchToMouseEvent(touch) {
    const rect = WhiteboardState.canvas.getBoundingClientRect();

    return {
      clientX: touch.clientX,
      clientY: touch.clientY,
      offsetX: touch.clientX - rect.left,
      offsetY: touch.clientY - rect.top
    };
  },

  // --------------------------------------------------
  // DRAW LOCAL
  // --------------------------------------------------
  startDraw(e) {
    if (!WhiteboardState.ctx) return;

    WhiteboardState.drawing = true;
    WhiteboardState.startX = e.offsetX;
    WhiteboardState.startY = e.offsetY;

    if (WhiteboardState.currentTool === "text") {
      const text = WhiteboardState.textValue || prompt("Entrez votre texte :");
      if (!text) {
        WhiteboardState.drawing = false;
        return;
      }

      this.drawText(e.offsetX, e.offsetY, text, true);
      WhiteboardState.drawing = false;
    }
  },

  draw(e) {
    if (!WhiteboardState.drawing) return;

    const { currentTool } = WhiteboardState;

    if (currentTool === "pen" || currentTool === "eraser") {
      this.drawFree(e.offsetX, e.offsetY, true);
    }
  },

  stopDraw(e) {
    if (!WhiteboardState.drawing) return;

    const { currentTool, startX, startY } = WhiteboardState;

    if (e && currentTool === "line") {
      this.drawLine(startX, startY, e.offsetX, e.offsetY, true);
    }

    if (e && currentTool === "rect") {
      this.drawRect(startX, startY, e.offsetX, e.offsetY, true);
    }

    WhiteboardState.drawing = false;
  },

  // --------------------------------------------------
  // FREE DRAW
  // --------------------------------------------------
  drawFree(x, y, emit = false) {
    const { ctx, startX, startY, currentTool } = WhiteboardState;
    if (!ctx) return;

    ctx.strokeStyle = currentTool === "eraser" ? "#ffffff" : WhiteboardState.color;
    ctx.lineWidth = WhiteboardState.size;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(x, y);
    ctx.stroke();

    if (emit) {
      WhiteboardSocket.sendStroke({
        tool: currentTool,
        startX,
        startY,
        endX: x,
        endY: y,
        color: WhiteboardState.color,
        size: WhiteboardState.size
      });
    }

    WhiteboardState.startX = x;
    WhiteboardState.startY = y;
  },

  // --------------------------------------------------
  // LINE
  // --------------------------------------------------
  drawLine(x1, y1, x2, y2, emit = false) {
    const { ctx } = WhiteboardState;
    if (!ctx) return;

    ctx.strokeStyle = WhiteboardState.color;
    ctx.lineWidth = WhiteboardState.size;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (emit) {
      WhiteboardSocket.sendStroke({
        tool: "line",
        startX: x1,
        startY: y1,
        endX: x2,
        endY: y2,
        color: WhiteboardState.color,
        size: WhiteboardState.size
      });
    }
  },

  // --------------------------------------------------
  // RECTANGLE
  // --------------------------------------------------
  drawRect(x1, y1, x2, y2, emit = false) {
    const { ctx } = WhiteboardState;
    if (!ctx) return;

    ctx.strokeStyle = WhiteboardState.color;
    ctx.lineWidth = WhiteboardState.size;

    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

    if (emit) {
      WhiteboardSocket.sendStroke({
        tool: "rect",
        startX: x1,
        startY: y1,
        endX: x2,
        endY: y2,
        color: WhiteboardState.color,
        size: WhiteboardState.size
      });
    }
  },

  // --------------------------------------------------
  // TEXT
  // --------------------------------------------------
  drawText(x, y, text, emit = false) {
    const { ctx } = WhiteboardState;
    if (!ctx) return;

    ctx.fillStyle = WhiteboardState.color;
    ctx.font = `${WhiteboardState.size * 5}px Arial`;
    ctx.fillText(text, x, y);

    if (emit) {
      WhiteboardSocket.sendStroke({
        tool: "text",
        x,
        y,
        text,
        color: WhiteboardState.color,
        size: WhiteboardState.size
      });
    }
  },

  // --------------------------------------------------
  // CLEAR
  // --------------------------------------------------
  clear(emit = true) {
    const { canvas, ctx } = WhiteboardState;
    if (!canvas || !ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.view.scale = 1;
    this.view.offsetX = 0;
    this.view.offsetY = 0;

    if (emit) {
      WhiteboardSocket.sendClear();
    }
  },

  // --------------------------------------------------
  // REMOTE STROKES
  // --------------------------------------------------
 remoteStroke(data) {
  const { ctx } = WhiteboardState;
  if (!ctx) return;

  ctx.strokeStyle = data.tool === "eraser"
    ? "#ffffff"
    : data.color;

  ctx.lineWidth = data.size;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  switch (data.tool) {

    case "pen":
    case "eraser":
      ctx.beginPath();
      ctx.moveTo(data.startX, data.startY);
      ctx.lineTo(data.endX, data.endY);
      ctx.stroke();
      break;

    case "line":
      ctx.beginPath();
      ctx.moveTo(data.startX, data.startY);
      ctx.lineTo(data.endX, data.endY);
      ctx.stroke();
      break;

    case "rect":
      ctx.strokeRect(
        data.startX,
        data.startY,
        data.endX - data.startX,
        data.endY - data.startY
      );
      break;

    case "text":
      ctx.fillStyle = data.color;
      ctx.font = `${data.size * 5}px Arial`;
      ctx.fillText(data.text, data.x, data.y);
      break;
  }
},
  // --------------------------------------------------
  // ZOOM / PAN
  // --------------------------------------------------
  handleWheelZoom(e) {
    const zoomIntensity = 0.1;
    const { offsetX, offsetY, deltaY } = e;

    const direction = deltaY > 0 ? -1 : 1;
    const factor = 1 + direction * zoomIntensity;

    const newScale = this.view.scale * factor;
    if (newScale < this.view.minScale || newScale > this.view.maxScale) return;

    this.view.offsetX = offsetX - (offsetX - this.view.offsetX) * factor;
    this.view.offsetY = offsetY - (offsetY - this.view.offsetY) * factor;

    this.view.scale = newScale;

    this.applyTransform();
  },

  handlePinchZoom(e) {
    if (e.touches.length !== 2) return;

    const touch1 = e.touches[0];
    const touch2 = e.touches[1];

    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const center = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };

    if (!this.lastTouchDistance) {
      this.lastTouchDistance = distance;
      this.lastTouchCenter = center;
      return;
    }

    const scaleFactor = distance / this.lastTouchDistance;
    const newScale = this.view.scale * scaleFactor;

    if (newScale < this.view.minScale || newScale > this.view.maxScale) return;

    this.view.offsetX = center.x - (center.x - this.view.offsetX) * scaleFactor;
    this.view.offsetY = center.y - (center.y - this.view.offsetY) * scaleFactor;

    this.view.scale = newScale;

    this.lastTouchDistance = distance;
    this.lastTouchCenter = center;

    this.applyTransform();
  },

  startPan(e) {
    this.isPanning = true;
    this.panStart.x = e.clientX - this.view.offsetX;
    this.panStart.y = e.clientY - this.view.offsetY;
  },

  pan(e) {
    if (!this.isPanning) return;

    this.view.offsetX = e.clientX - this.panStart.x;
    this.view.offsetY = e.clientY - this.panStart.y;

    this.applyTransform();
  },

  stopPan() {
    this.isPanning = false;
  },

  applyTransform() {
    const { ctx } = WhiteboardState;
    if (!ctx) return;

    ctx.setTransform(
      this.view.scale,
      0,
      0,
      this.view.scale,
      this.view.offsetX,
      this.view.offsetY
    );
  },

  resetZoom() {
    this.view.scale = 1;
    this.view.offsetX = 0;
    this.view.offsetY = 0;
    this.applyTransform();
  }
};
