// ======================================================
// WHITEBOARD STATE Ã¢â¬â Ãâ°TAT GLOBAL DU MODULE
// ======================================================

export const WhiteboardState = {

  // Canvas + contexte
  canvas: null,
  ctx: null,

  // Dessin en cours
  drawing: false,
  startX: 0,
  startY: 0,

  // Style
  color: "#000000",
  size: 3,

  // Outil actif
  // pen | eraser | line | rect | text
  currentTool: "pen",

// Texte (outil text)
textValue: "",

// Mode preview (pour line/rect)
isPreview: false,


  // Snapshot utilisÃÂ© pour line/rect (handlers)
  snapshot: null,

  // ======================================================
  // ZOOM / PAN Ã¢â¬â GÃâ°RÃâ°S PAR WHITEBOARD CORE
  // ======================================================

  view: {
    scale: 1,
    minScale: 0.5,
    maxScale: 3,
    offsetX: 0,
    offsetY: 0
  },

  // Pan (dÃÂ©placement)
  isPanning: false,
  panStart: { x: 0, y: 0 },

  // Pinch-to-zoom (mobile)
  lastTouchDistance: null,
  lastTouchCenter: null
};

