// ======================================================
// WHITEBOARD / TOOLS â€” VERSION SENIOR+++
// ======================================================

import { WhiteboardState } from "./whiteboard.state.js";

// Liste des outils autorisÃ©s
const ALLOWED_TOOLS = ["pen", "eraser", "line", "rect", "text"];

export function setTool(tool) {
  if (!ALLOWED_TOOLS.includes(tool)) {
    console.warn(`âŒ WhiteboardTools.setTool: outil invalide "${tool}"`);
    return;
  }

  WhiteboardState.currentTool = tool;
  WhiteboardState.isPreview = false;

  console.log(`ðŸ› ï¸ Outil sÃ©lectionnÃ© : ${tool}`);
}

export function setColor(color) {
  if (typeof color !== "string" || !color.trim()) {
    console.warn("âŒ WhiteboardTools.setColor: couleur invalide");
    return;
  }

  WhiteboardState.color = color;
  console.log(`ðŸŽ¨ Couleur dÃ©finie : ${color}`);
}

export function setSize(size) {
  const n = Number(size);

  if (isNaN(n) || n <= 0 || n > 200) {
    console.warn("âŒ WhiteboardTools.setSize: taille invalide");
    return;
  }

  WhiteboardState.size = n;
  console.log(`ðŸ“ Taille dÃ©finie : ${n}`);
}

export function setTextValue(value) {
  if (typeof value !== "string") {
    console.warn("âŒ WhiteboardTools.setTextValue: texte invalide");
    return;
  }

  WhiteboardState.textValue = value;
  console.log(`âœï¸ Texte dÃ©fini : "${value}"`);
}

export function enablePreview() {
  WhiteboardState.isPreview = true;
  console.log("ðŸ‘ï¸ Mode preview activÃ©");
}

