// ======================================================
// WHITEBOARD / TOOLS Ã¢â¬â VERSION SENIOR+++
// ======================================================

import { WhiteboardState } from "./whiteboard.state.js";

// Liste des outils autorisÃÂ©s
const ALLOWED_TOOLS = ["pen", "eraser", "line", "rect", "text"];

export function setTool(tool) {
  if (!ALLOWED_TOOLS.includes(tool)) {
    console.warn(`Ã¢ÂÅ WhiteboardTools.setTool: outil invalide "${tool}"`);
    return;
  }

  WhiteboardState.currentTool = tool;
  WhiteboardState.isPreview = false;

  console.log(`Ã°Å¸âºÂ Ã¯Â¸Â Outil sÃÂ©lectionnÃÂ© : ${tool}`);
}

export function setColor(color) {
  if (typeof color !== "string" || !color.trim()) {
    console.warn("Ã¢ÂÅ WhiteboardTools.setColor: couleur invalide");
    return;
  }

  WhiteboardState.color = color;
  console.log(`Ã°Å¸Å½Â¨ Couleur dÃÂ©finie : ${color}`);
}

export function setSize(size) {
  const n = Number(size);

  if (isNaN(n) || n <= 0 || n > 200) {
    console.warn("Ã¢ÂÅ WhiteboardTools.setSize: taille invalide");
    return;
  }

  WhiteboardState.size = n;
  console.log(`Ã°Å¸âÂ Taille dÃÂ©finie : ${n}`);
}

export function setTextValue(value) {
  if (typeof value !== "string") {
    console.warn("Ã¢ÂÅ WhiteboardTools.setTextValue: texte invalide");
    return;
  }

  WhiteboardState.textValue = value;
  console.log(`Ã¢ÅÂÃ¯Â¸Â Texte dÃÂ©fini : "${value}"`);
}

export function enablePreview() {
  WhiteboardState.isPreview = true;
  console.log("Ã°Å¸âÂÃ¯Â¸Â Mode preview activÃÂ©");
}

