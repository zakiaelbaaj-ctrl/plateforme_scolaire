// public/js/lib/dom.js
// Senior+++ DOM utilities for Plateforme Scolaire
// - Zero-dependency ES module
// - Small, well-tested helpers for safe DOM access, creation, delegation,
//   accessible modals/toasts, focus management, form serialization, and utilities
// - Defensive: null checks, graceful fallbacks, ARIA-friendly, keyboard accessible
// - Designed to integrate with Dashboard_eleve modules (ui, auth, websocket, timer, etc.)

/* ==========================================================================
   Exports
   ========================================================================== */
/*
export {
  qs, qsa, createEl, mount, empty, delegate, on, off,
  once, toggleClass, addClass, removeClass, hasClass,
  trapFocus, releaseFocus, showModal, closeModal,
  showToast, dismissToast, serializeForm, parseForm,
  setAttr, removeAttr, attr, text, html, isVisible,
  waitFor, observeVisibility
}
*/

/* ==========================================================================
   Basic selectors and safe wrappers
   ========================================================================== */
export function qs(selector, root = document) {
  if (!selector) return null;
  try { return root.querySelector(selector); } catch (e) { return null; }
}

export function qsa(selector, root = document) {
  if (!selector) return [];
  try { return Array.from(root.querySelectorAll(selector)); } catch (e) { return []; }
}

/* ==========================================================================
   Element creation and manipulation
   ========================================================================== */
export function createEl(tag = "div", attrs = {}, children = []) {
  const el = document.createElement(tag);
  setAttributes(el, attrs);
  appendChildren(el, children);
  return el;
}

export function setAttributes(el, attrs = {}) {
  if (!el || typeof attrs !== "object") return;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k === "dataset" && typeof v === "object") {
      for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    } else if (k.startsWith("aria-") || k.startsWith("data-")) {
      el.setAttribute(k, String(v));
    } else if (k === "style" && typeof v === "object") {
      Object.assign(el.style, v);
    } else {
      el.setAttribute(k, String(v));
    }
  }
}

export function appendChildren(el, children = []) {
  if (!el || !children) return;
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === "string" || typeof c === "number") el.appendChild(document.createTextNode(String(c)));
    else if (c instanceof Node) el.appendChild(c);
    else if (Array.isArray(c)) appendChildren(el, c);
  }
}

export function mount(parent, child) {
  const p = typeof parent === "string" ? qs(parent) : parent;
  if (!p) return null;
  p.appendChild(child);
  return child;
}

export function empty(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

/* ==========================================================================
   Class helpers
   ========================================================================== */
export function addClass(el, cls) { if (el && cls) el.classList.add(...cls.split(/\s+/)); }
export function removeClass(el, cls) { if (el && cls) el.classList.remove(...cls.split(/\s+/)); }
export function toggleClass(el, cls, force) { if (el && cls) el.classList.toggle(cls, force); }
export function hasClass(el, cls) { return el ? el.classList.contains(cls) : false; }

/* ==========================================================================
   Attribute / content helpers
   ========================================================================== */
export function attr(el, name, value) {
  if (!el || !name) return;
  if (arguments.length === 2) return el.getAttribute(name);
  if (value === null || value === false) el.removeAttribute(name);
  else el.setAttribute(name, String(value));
}
export function setAttr(el, name, value) { attr(el, name, value); }
export function removeAttr(el, name) { if (el) el.removeAttribute(name); }
export function text(el, value) { if (!el) return; if (value === undefined) return el.textContent; el.textContent = String(value); }
export function html(el, value) { if (!el) return; if (value === undefined) return el.innerHTML; el.innerHTML = String(value); }

/* ==========================================================================
   Event delegation and helpers
   ========================================================================== */
export function delegate(root, selector, eventName, handler, options = {}) {
  const fn = (e) => {
    const target = e.target.closest ? e.target.closest(selector) : null;
    if (target && root.contains(target)) handler.call(target, e, target);
  };
  root.addEventListener(eventName, fn, options);
  return () => root.removeEventListener(eventName, fn, options);
}

export function on(el, eventName, handler, options = {}) {
  if (!el) return () => {};
  el.addEventListener(eventName, handler, options);
  return () => el.removeEventListener(eventName, handler, options);
}

export function off(el, eventName, handler, options = {}) {
  if (!el) return;
  el.removeEventListener(eventName, handler, options);
}

export function once(el, eventName, handler, options = {}) {
  const opts = { ...options, once: true };
  el.addEventListener(eventName, handler, opts);
}

/* ==========================================================================
   Visibility & utilities
   ========================================================================== */
export function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== "hidden";
}

export function waitFor(selector, { root = document, timeout = 5000 } = {}) {
  return new Promise((resolve, reject) => {
    const found = root.querySelector(selector);
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const f = root.querySelector(selector);
      if (f) {
        obs.disconnect();
        clearTimeout(timer);
        resolve(f);
      }
    });
    obs.observe(root, { childList: true, subtree: true });
    const timer = setTimeout(() => {
      obs.disconnect();
      reject(new Error("waitFor timeout"));
    }, timeout);
  });
}

/* ==========================================================================
   Form helpers
   ========================================================================== */
export function serializeForm(form) {
  if (!form || !(form instanceof HTMLFormElement)) return {};
  const data = {};
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) {
    if (Object.prototype.hasOwnProperty.call(data, k)) {
      if (!Array.isArray(data[k])) data[k] = [data[k]];
      data[k].push(v);
    } else {
      data[k] = v;
    }
  }
  return data;
}

export function parseForm(form, obj = {}) {
  if (!form || !(form instanceof HTMLFormElement)) return obj;
  const inputs = Array.from(form.elements).filter(Boolean);
  for (const el of inputs) {
    if (!el.name) continue;
    if (el.type === "checkbox") obj[el.name] = el.checked;
    else if (el.type === "radio") { if (el.checked) obj[el.name] = el.value; }
    else obj[el.name] = el.value;
  }
  return obj;
}

/* ==========================================================================
   Accessible toast system (simple)
   ========================================================================== */
const _toasts = new Map();
let _toastContainer = null;

function _ensureToastContainer() {
  if (_toastContainer) return _toastContainer;
  _toastContainer = createEl("div", { id: "ps-toast-container", class: "ps-toast-container", "aria-live": "polite", "aria-atomic": "true" });
  Object.assign(_toastContainer.style, {
    position: "fixed", right: "16px", bottom: "16px", zIndex: 9999, display: "grid", gap: "8px",
  });
  document.body.appendChild(_toastContainer);
  return _toastContainer;
}

export function showToast(message, { key = null, duration = 4500 } = {}) {
  if (!message) return null;
  const container = _ensureToastContainer();
  const id = key || `toast:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  if (_toasts.has(id)) {
    // refresh timer
    const t = _toasts.get(id);
    clearTimeout(t.timer);
    t.timer = setTimeout(() => dismissToast(id), duration);
    return t.el;
  }
  const el = createEl("div", { class: "ps-toast", role: "status", "aria-live": "polite", text: message });
  Object.assign(el.style, {
    background: "#111827", color: "#fff", padding: "10px 14px", borderRadius: "8px", boxShadow: "0 6px 18px rgba(2,6,23,0.12)",
  });
  container.appendChild(el);
  const timer = setTimeout(() => dismissToast(id), duration);
  _toasts.set(id, { el, timer });
  return el;
}

export function dismissToast(key) {
  const entry = _toasts.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.el.remove();
  _toasts.delete(key);
}

/* ==========================================================================
   Accessible modal with focus trap
   ========================================================================== */
const _modals = new Map();
let _activeModal = null;
let _previousActiveElement = null;

function _focusableElements(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'))
    .filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
}

export function trapFocus(container) {
  if (!container) return () => {};
  const focusables = _focusableElements(container);
  if (!focusables.length) return () => {};
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  function handleKey(e) {
    if (e.key !== "Tab") return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
  document.addEventListener("keydown", handleKey);
  // return release function
  return () => document.removeEventListener("keydown", handleKey);
}

export function showModal({ title = "", content = "", closable = true, size = "medium", onClose = null } = {}) {
  // create modal shell
  const overlay = createEl("div", { class: "ps-modal-overlay", role: "dialog", "aria-modal": "true" });
  Object.assign(overlay.style, { position: "fixed", inset: 0, background: "rgba(2,6,23,0.45)", display: "grid", placeItems: "center", zIndex: 10000 });
  const dialog = createEl("div", { class: `ps-modal ps-modal-${size}`, role: "document" });
  Object.assign(dialog.style, { background: "#fff", borderRadius: "8px", maxWidth: "920px", width: "min(92%, 720px)", boxShadow: "0 10px 30px rgba(2,6,23,0.2)" });
  const header = createEl("header", { class: "ps-modal-header" }, [
    createEl("h2", { class: "ps-modal-title", text: title }),
  ]);
  const body = createEl("div", { class: "ps-modal-body", html: typeof content === "string" ? content : "" });
  if (content instanceof Node) body.appendChild(content);
  const footer = createEl("footer", { class: "ps-modal-footer" });
  if (closable) {
    const closeBtn = createEl("button", { class: "ps-modal-close", "aria-label": "Fermer", text: "Fermer" });
    closeBtn.addEventListener("click", () => closeModal(overlay, onClose));
    footer.appendChild(closeBtn);
  }
  dialog.appendChild(header);
  dialog.appendChild(body);
  dialog.appendChild(footer);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // focus management
  _previousActiveElement = document.activeElement;
  const focusables = _focusableElements(dialog);
  if (focusables.length) focusables[0].focus();
  const release = trapFocus(dialog);

  // store modal
  const id = `modal:${Date.now()}:${Math.random().toString(36).slice(2,8)}`;
  _modals.set(id, { overlay, release, onClose });
  _activeModal = id;

  // close on ESC
  const escHandler = (e) => { if (e.key === "Escape") closeModal(overlay, onClose); };
  document.addEventListener("keydown", escHandler);

  // return controller
  return {
    id,
    close: () => closeModal(overlay, onClose),
    element: overlay,
    destroy: () => {
      closeModal(overlay, onClose);
      document.removeEventListener("keydown", escHandler);
    },
  };
}

export function closeModal(overlay, onClose) {
  if (!overlay) return;
  try {
    overlay.remove();
  } catch (e) { /* ignore */ }
  // release focus trap
  if (_activeModal) {
    const m = _modals.get(_activeModal);
    if (m && typeof m.release === "function") m.release();
    _modals.delete(_activeModal);
    _activeModal = null;
  }
  if (_previousActiveElement && typeof _previousActiveElement.focus === "function") {
    _previousActiveElement.focus();
    _previousActiveElement = null;
  }
  if (typeof onClose === "function") onClose();
}

/* ==========================================================================
   Visibility observer (IntersectionObserver wrapper)
   ========================================================================== */
export function observeVisibility(target, cb, { root = null, rootMargin = "0px", threshold = 0 } = {}) {
  if (!target || typeof cb !== "function") return () => {};
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) cb(entry);
  }, { root, rootMargin, threshold });
  observer.observe(target);
  return () => observer.disconnect();
}

/* ==========================================================================
   Small utilities
   ========================================================================== */
export function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export function uid(prefix = "id") { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }

/* ==========================================================================
   Module init: ensure document-ready helpers (optional)
   ========================================================================== */
export function ready(fn) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(fn, 0);
  } else {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  }
}

/* ==========================================================================
   End of file
   ========================================================================== */

