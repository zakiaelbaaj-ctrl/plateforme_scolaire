// ======================================================
// WHITEBOARD / TOOLS — VERSION SENIOR+++
// ======================================================

import { WhiteboardState } from "./whiteboard.state.js";

// Liste des outils autorisés
const ALLOWED_TOOLS = ["pen", "eraser", "line", "rect", "text"];

export function setTool(tool) {
  if (!ALLOWED_TOOLS.includes(tool)) {
    console.warn(`❌ WhiteboardTools.setTool: outil invalide "${tool}"`);
    return;
  }

  WhiteboardState.currentTool = tool;
  WhiteboardState.isPreview = false;

  console.log(`🛠️ Outil sélectionné : ${tool}`);
}

export function setColor(color) {
  if (typeof color !== "string" || !color.trim()) {
    console.warn("❌ WhiteboardTools.setColor: couleur invalide");
    return;
  }

  WhiteboardState.color = color;
  console.log(`🎨 Couleur définie : ${color}`);
}

export function setSize(size) {
  const n = Number(size);

  if (isNaN(n) || n <= 0 || n > 200) {
    console.warn("❌ WhiteboardTools.setSize: taille invalide");
    return;
  }

  WhiteboardState.size = n;
  console.log(`📏 Taille définie : ${n}`);
}

export function setTextValue(value) {
  if (typeof value !== "string") {
    console.warn("❌ WhiteboardTools.setTextValue: texte invalide");
    return;
  }

  WhiteboardState.textValue = value;
  console.log(`✏️ Texte défini : "${value}"`);
}

export function enablePreview() {
  WhiteboardState.isPreview = true;
  console.log("👁️ Mode preview activé");
}
