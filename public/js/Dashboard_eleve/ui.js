// public/js/Dashboard_eleve/ui.js
// Senior+++ UI helpers for Dashboard_eleve
// - Accessible, resilient, i18n-friendly utilities for wiring the student dashboard UI
// - updateMatiereSelect: fills <select id="matiereSelect"> with options and provides robust API
// - Exports: updateMatiereSelect, initMatiereSelect, getSelectedMatiere, setSelectedMatiere, on, off
// - Defensive: null checks, type validation, persistence, debounced events, MutationObserver
// - Integrates with lightweight websocket initializer on DOMContentLoaded (non-blocking)

import { initWebSocket } from "./websocket.js";

/* ==========================================================================
   Tiny event emitter (local to this module)
   ========================================================================== */
const _events = new Map();

export function on(event, fn) {
  if (typeof fn !== "function") return () => {};
  if (!_events.has(event)) _events.set(event, new Set());
  _events.get(event).add(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  if (!_events.has(event)) return;
  _events.get(event).delete(fn);
}

function emit(event, payload) {
  const set = _events.get(event);
  if (!set) return;
  for (const fn of Array.from(set)) {
    try { fn(payload); } catch (err) { /* swallow subscriber errors */ }
  }
}

/* ==========================================================================
   Utilities
   ========================================================================== */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (v === false || v === null) continue;
    else node.setAttribute(k, String(v));
  }
  for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

function debounce(fn, wait = 150) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ==========================================================================
   Persistence helpers
   ========================================================================== */
const STORAGE_KEY = "ps:dashboard:ui:matiere";
function persistSelectedMatiere(value) {
  try { localStorage.setItem(STORAGE_KEY, String(value)); } catch (e) { /* ignore */ }
}
function readPersistedMatiere() {
  try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
}

/* ==========================================================================
   Core: updateMatiereSelect
   ========================================================================== */
/**
 * Fill and manage the <select id="matiereSelect"> element.
 *
 * @param {Array<string|object>} matieres - array of strings or objects { id, label }
 * @param {Object} options
 *   - placeholder: string shown as first option (default: "📚 Choisir une matière")
 *   - persist: boolean (save selection to localStorage) default true
 *   - autoSelect: boolean (auto-select first option when none selected) default true
 *   - ariaLabel: string for accessibility
 */
export function updateMatiereSelect(matieres = [], options = {}) {
  const {
    placeholder = "📚 Choisir une matière",
    persist = true,
    autoSelect = true,
    ariaLabel = "Sélectionner une matière",
  } = options;

  const select = document.getElementById("matiereSelect");
  if (!select) return;

  // Normalize input to objects { id, label }
  const items = Array.isArray(matieres)
    ? matieres.map((m) => {
        if (typeof m === "string") return { id: m, label: m };
        if (m && typeof m === "object") {
          const id = m.id ?? (typeof m.label === "string" ? m.label : String(m));
          const label = m.label ?? String(m.id ?? m);
          return { id: String(id), label: String(label) };
        }
        return null;
      }).filter(Boolean)
    : [];

  // Preserve previous selection (persisted or current)
  const prevValue = select.value || (persist ? readPersistedMatiere() : null);

  // Build options fragment for performance
  const frag = document.createDocumentFragment();

  // Placeholder option (value empty)
  const placeholderOpt = el("option", { value: "", text: placeholder });
  placeholderOpt.disabled = false;
  frag.appendChild(placeholderOpt);

  // Create options
  for (const it of items) {
    const opt = el("option", { value: it.id, text: it.label });
    frag.appendChild(opt);
  }

  // Replace content atomically
  select.innerHTML = "";
  select.appendChild(frag);

  // Accessibility attributes
  select.setAttribute("aria-label", ariaLabel);
  select.setAttribute("role", "listbox");
  select.setAttribute("aria-live", "polite");

  // Restore previous selection if available
  if (prevValue) {
    const found = Array.from(select.options).some((o) => o.value === prevValue);
    if (found) {
      select.value = prevValue;
    } else if (autoSelect && items.length) {
      select.value = items[0].id;
    } else {
      select.value = "";
    }
  } else if (autoSelect && items.length) {
    select.value = items[0].id;
  } else {
    select.value = "";
  }

  // Persist and emit initial selection
  if (persist) persistSelectedMatiere(select.value || "");
  emit("matiere:change", select.value || "");

  // Live region for screen readers
  let liveRegion = document.getElementById("matiereSelectLive");
  if (!liveRegion) {
    liveRegion = el("div", { id: "matiereSelectLive", class: "visually-hidden", "aria-live": "polite" });
    // visually-hidden class should exist in your CSS; fallback inline style if not
    if (!document.querySelector(".visually-hidden")) {
      liveRegion.style.position = "absolute";
      liveRegion.style.width = "1px";
      liveRegion.style.height = "1px";
      liveRegion.style.margin = "-1px";
      liveRegion.style.border = "0";
      liveRegion.style.padding = "0";
      liveRegion.style.clip = "rect(0 0 0 0)";
      liveRegion.style.overflow = "hidden";
      liveRegion.style.whiteSpace = "nowrap";
    }
    document.body.appendChild(liveRegion);
  }

  // Debounced change handler
  const onChange = debounce((e) => {
    const value = e.target.value || "";
    if (persist) persistSelectedMatiere(value);
    liveRegion.textContent = value ? `Matière sélectionnée : ${value}` : "Aucune matière sélectionnée";
    emit("matiere:change", value);
  }, 120);

  // Remove previous handler if present to avoid duplicates
  if (select._matiereChangeHandler) {
    select.removeEventListener("change", select._matiereChangeHandler);
  }
  select._matiereChangeHandler = onChange;
  select.addEventListener("change", onChange);

  // Programmatic selection helper
  select.setMatiere = (id) => {
    const found = Array.from(select.options).some((o) => o.value === id);
    if (found) {
      select.value = id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
    return false;
  };

  // MutationObserver to detect external changes to options
  if (select._observer) select._observer.disconnect();
  const observer = new MutationObserver(() => {
    emit("matiere:options:changed", { count: select.options.length });
  });
  observer.observe(select, { childList: true });
  select._observer = observer;
}

/* ==========================================================================
   Convenience helpers
   ========================================================================== */

/**
 * Return currently selected matiere value (string) or empty string.
 */
export function getSelectedMatiere() {
  const select = document.getElementById("matiereSelect");
  if (!select) return "";
  return select.value || "";
}

/**
 * Programmatically set the selected matiere. Returns true if applied.
 * @param {string} id
 */
export function setSelectedMatiere(id) {
  const select = document.getElementById("matiereSelect");
  if (!select) return false;
  if (typeof select.setMatiere === "function") return select.setMatiere(id);
  const found = Array.from(select.options).some((o) => o.value === id);
  if (found) {
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }
  return false;
}

/**
 * Initialize the matiere select with items and options.
 * Useful for bootstrapping from server data.
 */
export function initMatiereSelect({ matieres = [], options = {} } = {}) {
  updateMatiereSelect(matieres, options);
  const persisted = readPersistedMatiere();
  if (persisted) emit("matiere:change", persisted);
}

/* ==========================================================================
   Auto-init websocket on DOMContentLoaded (requested)
   - Defensive: initWebSocket may throw if already initialized; we catch errors.
   ========================================================================== */
window.addEventListener("DOMContentLoaded", () => {
  try {
    initWebSocket();
  } catch (err) {
    // Non-fatal: log for diagnostics but do not interrupt UI
    // eslint-disable-next-line no-console
    console.warn("initWebSocket() failed in ui.js:", err);
  }
});

/* ==========================================================================
   Default export (convenience)
   ========================================================================== */
export default {
  updateMatiereSelect,
  initMatiereSelect,
  getSelectedMatiere,
  setSelectedMatiere,
  on,
  off,
};
