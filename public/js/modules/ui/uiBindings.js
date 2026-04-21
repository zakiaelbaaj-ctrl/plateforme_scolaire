import { AppState } from "../../core/state.js";

import {
  renderProfessorsList,
  renderChatMessage,
  clearChatUI,
  renderDocumentItem,
  clearDocumentsUI,
  renderInvoice,
  updateTimerUI,
  resetTimerUI
} from "./uiRenderers.js";


// ======================================================
// UI BINDINGS â€” Connecte AppState â†” UI
// ======================================================

// ---------- PROFESSORS ----------
AppState.on("professors:update", (profs) => {
  renderProfessorsList(profs);
});

// ---------- CHAT ----------
AppState.on("chat:new", (msg) => {
  renderChatMessage(msg);
});

AppState.on("chat:clear", () => {
  clearChatUI();
});

// ---------- DOCUMENTS ----------
AppState.on("documents:new", (doc) => {
  renderDocumentItem(doc);
});

AppState.on("documents:clear", () => {
  clearDocumentsUI();
});

// ---------- TIMER ----------
AppState.on("timer:update", (seconds) => {
  updateTimerUI(seconds);
});

AppState.on("timer:reset", () => {
  resetTimerUI();
});

// ---------- INVOICE ----------
AppState.on("invoice:show", (data) => {
  renderInvoice(data);
});

