// ======================================================
// WHITEBOARD HANDLERS â€” SOURIS + TACTILE
// ======================================================

import { WhiteboardState } from "./whiteboard.state.js";
import { WhiteboardSocket } from "./whiteboard.socket.js";
import { WhiteboardCore } from "./whiteboard.core.js";

// ------------------------------------------------------
// SNAPSHOT (pour LINE et RECT)
// ------------------------------------------------------
function takeSnapshot() {
  const { ctx, canvas } = WhiteboardState;
  if (!ctx) return;
  WhiteboardState.snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ------------------------------------------------------
// SOURIS
// ------------------------------------------------------
function onMouseDown(e) {
  if (!WhiteboardState.ctx) return;

  // EmpÃªcher conflit avec PAN (bouton droit/milieu)
  if (e.button !== 0) return;

  const rect = WhiteboardState.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);

  WhiteboardState.drawing = true;
  WhiteboardState.startX = x;
  WhiteboardState.startY = y;
  WhiteboardState.lastX = x;
  WhiteboardState.lastY = y;

  if (WhiteboardState.currentTool === "line" || WhiteboardState.currentTool === "rect") {
    takeSnapshot();
  }
}

function onMouseUp() {
  WhiteboardState.drawing = false;
  WhiteboardState.snapshot = null;
}

function onMouseLeave() {
  WhiteboardState.drawing = false;
}

// ------------------------------------------------------
// TOUCH â†’ SOURIS
// ------------------------------------------------------
function getTouchPos(e) {
  const rect = WhiteboardState.canvas.getBoundingClientRect();
  const touch = e.touches[0] || e.changedTouches[0];

  return {
    clientX: touch.clientX,
    clientY: touch.clientY
  };
}

function onTouchStart(e) {
  if (e.touches.length !== 1) return; // Ã©viter conflit pinch-zoom
  e.preventDefault();
  onMouseDown(getTouchPos(e));
}

function onTouchMove(e) {
  if (e.touches.length !== 1) return;
  e.preventDefault();
  draw(getTouchPos(e));
}

function onTouchEnd(e) {
  e.preventDefault();
  onMouseUp();
}

// ------------------------------------------------------
// DESSIN LOCAL
// ------------------------------------------------------
function draw(e) {
  if (!WhiteboardState.drawing || !WhiteboardState.ctx) return;

  const ctx = WhiteboardState.ctx;
  const rect = WhiteboardState.canvas.getBoundingClientRect();

  const toX = (e.clientX - rect.left);
  const toY = (e.clientY - rect.top);

  const { currentTool, color, size, lastX, lastY } = WhiteboardState;

  ctx.lineWidth = size;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // âœï¸ STYLO
  if (currentTool === "pen") {
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    WhiteboardSocket.sendStroke({
      tool: "pen",
      color,
      size,
      startX: lastX,
      startY: lastY,
      endX: toX,
      endY: toY
    });
  }

  // ðŸ§½ GOMME
  else if (currentTool === "eraser") {
    ctx.clearRect(toX - size, toY - size, size * 2, size * 2);

    WhiteboardSocket.sendStroke({
      tool: "eraser",
      startX: lastX,
      startY: lastY,
      endX: toX,
      endY: toY,
      size
    });
  }

  // ðŸ“ LIGNE
  else if (currentTool === "line" && WhiteboardState.snapshot) {
    ctx.putImageData(WhiteboardState.snapshot, 0, 0);
    ctx.beginPath();
    ctx.moveTo(WhiteboardState.startX, WhiteboardState.startY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }

  // â–­ RECTANGLE
  else if (currentTool === "rect" && WhiteboardState.snapshot) {
    ctx.putImageData(WhiteboardState.snapshot, 0, 0);
    ctx.strokeRect(
      WhiteboardState.startX,
      WhiteboardState.startY,
      toX - WhiteboardState.startX,
      toY - WhiteboardState.startY
    );
  }

  WhiteboardState.lastX = toX;
  WhiteboardState.lastY = toY;
}

// ------------------------------------------------------
// INIT
// ------------------------------------------------------
export function initWhiteboard(canvas) {
  WhiteboardState.canvas = canvas;
  WhiteboardState.ctx = canvas.getContext("2d");

  // SOURIS
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", onMouseUp);
  canvas.addEventListener("mouseleave", onMouseLeave);

  // TACTILE
  canvas.addEventListener("touchstart", onTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onTouchMove, { passive: false });
  canvas.addEventListener("touchend", onTouchEnd);

  console.log("ðŸ“ Whiteboard Handlers initialisÃ©s");
}

