// public/js/Dashboard_eleve/notification.js
// Senior+++ notification helper for student dashboard
// - Imports and initializes a lightweight websocket helper on DOMContentLoaded
// - Exposes showToast, notifyBrowser, subscribe/unsubscribe handlers
// - Graceful fallbacks for browsers without Notifications API or service worker
// - Accessible toasts (aria-live) and deduplication

import { initWebSocket } from "./websocket.js";

const TOAST_NAMESPACE = "dashboard-notification";
const DEFAULT_DURATION = 4500;
const _activeToasts = new Map(); // dedupe by key

/**
 * Create and show an accessible toast message.
 * @param {string} message
 * @param {{key?:string, duration?:number, role?:string}} opts
 */
export function showToast(message, opts = {}) {
  const key = opts.key || `${TOAST_NAMESPACE}:${message}`;
  const duration = typeof opts.duration === "number" ? opts.duration : DEFAULT_DURATION;
  if (_activeToasts.has(key)) {
    // refresh timer
    const t = _activeToasts.get(key);
    clearTimeout(t.timeout);
    t.timeout = setTimeout(() => dismissToast(key), duration);
    return;
  }

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", opts.role || "status");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;
  toast.dataset.toastKey = key;
  toast.style.transition = "opacity 220ms ease, transform 220ms ease";
  toast.style.opacity = "0";
  toast.style.transform = "translateY(6px)";
  toast.style.pointerEvents = "auto";

  // append to body
  document.body.appendChild(toast);

  // force reflow then show
  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translateY(0)";
  });

  const timeout = setTimeout(() => dismissToast(key), duration);
  _activeToasts.set(key, { el: toast, timeout });
}

/**
 * Dismiss a toast by key
 * @param {string} key
 */
export function dismissToast(key) {
  const entry = _activeToasts.get(key);
  if (!entry) return;
  const { el, timeout } = entry;
  clearTimeout(timeout);
  el.style.opacity = "0";
  el.style.transform = "translateY(6px)";
  setTimeout(() => {
    el.remove();
  }, 240);
  _activeToasts.delete(key);
}

/**
 * Request browser notification permission and show a native notification if allowed.
 * Falls back to showToast when not available or permission denied.
 * @param {string} title
 * @param {{body?:string, tag?:string, data?:object}} opts
 */
export async function notifyBrowser(title, opts = {}) {
  // prefer Service Worker showNotification if available
  try {
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        reg.showNotification(title, {
          body: opts.body || "",
          tag: opts.tag,
          data: opts.data,
          renotify: true,
        });
        return;
      }
    }
  } catch (err) {
    // ignore and fallback
  }

  if (!("Notification" in window)) {
    showToast(`${title}${opts.body ? " — " + opts.body : ""}`);
    return;
  }

  if (Notification.permission === "granted") {
    new Notification(title, { body: opts.body || "", tag: opts.tag, data: opts.data });
    return;
  }

  if (Notification.permission !== "denied") {
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        new Notification(title, { body: opts.body || "", tag: opts.tag, data: opts.data });
        return;
      }
    } catch (err) {
      // ignore
    }
  }

  // fallback
  showToast(`${title}${opts.body ? " — " + opts.body : ""}`);
}

/**
 * Lightweight subscription registry for in-app notification handlers.
 * Handlers receive payload {type, data}
 */
const _subscribers = new Set();

export function subscribeNotifications(fn) {
  if (typeof fn !== "function") throw new TypeError("subscriber must be a function");
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

function _emitNotification(payload) {
  for (const fn of Array.from(_subscribers)) {
    try {
      fn(payload);
    } catch (err) {
      // swallow subscriber errors
      // eslint-disable-next-line no-console
      console.error("notification subscriber error", err);
    }
  }
}

/**
 * Handle incoming websocket notification payloads.
 * Expected shape: { type: string, data: any, title?: string, body?: string, tag?: string }
 */
export function handleIncomingNotification(payload) {
  if (!payload || typeof payload !== "object") return;
  // dedupe by tag if provided
  const dedupeKey = payload.tag || `${TOAST_NAMESPACE}:${payload.type}:${JSON.stringify(payload.data || {})}`;

  // in-app emit
  _emitNotification(payload);

  // show native or toast depending on payload
  if (payload.title) {
    notifyBrowser(payload.title, { body: payload.body, tag: payload.tag, data: payload.data });
  } else if (payload.body) {
    showToast(payload.body, { key: dedupeKey });
  } else {
    // generic
    showToast("Nouvelle notification", { key: dedupeKey });
  }
}

/* -------------------------
   WebSocket integration
   ------------------------- */

/**
 * initWebSocket is imported from ./websocket.js and is expected to:
 * - establish a websocket connection
 * - accept a callback to receive parsed messages
 * - return an object with a `close()` method
 *
 * We call initWebSocket on DOMContentLoaded (requested) and wire messages to our handler.
 */
let _wsController = null;

function _onWsMessage(msg) {
  // msg should be an object { type, data, title, body, tag }
  try {
    if (!msg || typeof msg !== "object") return;
    handleIncomingNotification(msg);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("notification handler error", err);
  }
}

/**
 * Initialize websocket helper and subscribe to messages.
 * Defensive: if initWebSocket is not available or throws, we degrade gracefully.
 */
export function startNotificationSocket() {
  try {
    // initWebSocket may return a controller or accept a callback; support both patterns
    const result = initWebSocket(_onWsMessage);
    // if it returns an object with close, keep reference
    if (result && typeof result.close === "function") {
      _wsController = result;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("startNotificationSocket failed:", err);
  }
}

export function stopNotificationSocket() {
  try {
    if (_wsController && typeof _wsController.close === "function") {
      _wsController.close();
      _wsController = null;
    }
  } catch (err) {
    // ignore
  }
}

/* -------------------------
   Auto-init on DOMContentLoaded (as requested)
   ------------------------- */
window.addEventListener("DOMContentLoaded", () => {
  try {
    // call the imported helper directly (global init)
    initWebSocket();
  } catch (err) {
    // if initWebSocket expects a callback, startNotificationSocket will call it later
    // eslint-disable-next-line no-console
    console.warn("initWebSocket() call failed (falling back to startNotificationSocket):", err);
    try {
      startNotificationSocket();
    } catch (e) {
      // final fallback: no-op
      // eslint-disable-next-line no-console
      console.warn("startNotificationSocket also failed:", e);
    }
  }
});

/* -------------------------
   Exports (default helper)
   ------------------------- */
export default {
  showToast,
  dismissToast,
  notifyBrowser,
  subscribeNotifications,
  handleIncomingNotification,
  startNotificationSocket,
  stopNotificationSocket,
};
