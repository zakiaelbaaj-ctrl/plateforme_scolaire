// ======================================================
// WHITEBOARD CONTRACT — TABLEAU STROKE
// Source de vérité du format des traits distants
// ======================================================
// ======================================================
// WHITEBOARD CONTRACT — VALIDATION TABLEAU STROKE
// ======================================================

export function isValidTableauStroke(s) {
  return (
    s &&
    typeof s === "object" &&
    ["pen", "eraser", "line", "rect"].includes(s.tool) &&
    typeof s.startX === "number" &&
    typeof s.startY === "number" &&
    typeof s.endX === "number" &&
    typeof s.endY === "number" &&
    typeof s.color === "string" &&
    typeof s.size === "number" &&
    s.size > 0 &&
    s.size <= 50
  );
}

export const TABLEAU_STROKE_CONTRACT = {
  type: "tableauStroke",
  roomId: "string",
  stroke: {
    tool: "pen" | "eraser" | "line" | "rect",
    startX: "number",
    startY: "number",
    endX: "number",
    endY: "number",
    color: "string",
    size: "number"
  }
};

  

