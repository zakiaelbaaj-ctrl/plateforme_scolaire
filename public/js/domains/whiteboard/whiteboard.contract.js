// ======================================================
// WHITEBOARD CONTRACT â€” TYPES WS + PAYLOAD FACTORY
// /js/domains/whiteboard/whiteboard.contract.js
// ======================================================
// âœ… Aucune dÃ©pendance â€” importe rien
// âœ… Source unique des types WS whiteboard
// âœ… UtilisÃ© par WhiteboardService uniquement
// ======================================================

export const WhiteboardEvents = {
  TABLEAU_STROKE: "tableauStroke",
  TABLEAU_CLEAR:  "tableauClear",
  TABLEAU_SYNC:   "tableauSync",
  TABLEAU_UNDO:   "tableauUndo",
  TABLEAU_REDO:   "tableauRedo",
  TABLEAU_TEXT:   "tableauText"
};

export const WhiteboardPayloadFactory = {

createStroke(path, roomId) {
  const firstPoint = path.points?.[0] ?? { x: 0, y: 0 };
  return {
    type: WhiteboardEvents.TABLEAU_STROKE,
    roomId,
    stroke: {
      ...path,
      x:    firstPoint.x,
      y:    firstPoint.y,
      type: "start"
    }
  };
},
  createClear(roomId) {
    return { type: WhiteboardEvents.TABLEAU_CLEAR, roomId };
  },

  createUndo(authorId, roomId) {
    return { type: WhiteboardEvents.TABLEAU_UNDO, authorId, roomId };
  },

  createRedo(authorId, roomId) {
    return { type: WhiteboardEvents.TABLEAU_REDO, authorId, roomId };
  },

  createSync(paths, roomId) {
    return { type: WhiteboardEvents.TABLEAU_SYNC, roomId, paths };
  },

  createText(textStroke, roomId) {
    return { type: WhiteboardEvents.TABLEAU_TEXT, roomId, text: textStroke };
  }

};

