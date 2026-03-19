// public/js/Dashboard_eleve/state.js
/**
 * Senior+++ state manager for the student dashboard
 * - ESM module, zero-deps
 * - Centralized reactive state with subscribe/unsubscribe
 * - Local persistence (optional), optimistic updates, and simple conflict handling
 * - Integrates with websocket initializer (initWebSocket) on DOMContentLoaded
 *
 * Usage:
 *   import state, { StateManager } from "/public/js/Dashboard_eleve/state.js";
 *   state.subscribe((s) => console.log("state changed", s));
 *   state.set("page", 2);
 */

import { initWebSocket } from "./websocket.js";

window.addEventListener("DOMContentLoaded", () => {
  try {
    initWebSocket();
  } catch (err) {
    // defensive: websocket helper may throw if already initialized or missing
    // eslint-disable-next-line no-console
    console.warn("initWebSocket() failed in state module:", err);
  }
});

const STORAGE_KEY = "ps:dashboard:state:v1";

class StateManager {
  constructor(initial = {}) {
    this._state = {
      user: null,
      courses: [],
      page: 1,
      pageSize: 12,
      total: 0,
      loading: false,
      lastUpdated: null,
      ...initial,
    };

    this._subs = new Set();
    this._persistDebounce = null;
    this._persistDelay = 300; // ms
    this._locked = false; // simple lock for optimistic updates
    this._initFromStorage();
  }

  /* -------------------------
     Public API
     ------------------------- */

  /**
   * Get a shallow copy of the state or a specific key
   * @param {string} [key]
   */
  get(key) {
    if (typeof key === "string") return this._state[key];
    return { ...this._state };
  }

  /**
   * Set one or multiple keys in state. Accepts (key, value) or (object).
   * @param {string|object} key
   * @param {*} [value]
   * @param {{persist:boolean}} [opts]
   */
  set(key, value, opts = { persist: true }) {
    if (this._locked) return;
    let patch = {};
    if (typeof key === "string") {
      patch[key] = value;
    } else if (key && typeof key === "object") {
      patch = { ...key };
    } else {
      return;
    }

    const changed = {};
    let any = false;
    for (const k of Object.keys(patch)) {
      const v = patch[k];
      if (this._state[k] !== v) {
        this._state[k] = v;
        changed[k] = v;
        any = true;
      }
    }
    if (!any) return;

    this._state.lastUpdated = Date.now();
    this._notify(changed);

    if (opts.persist) this._schedulePersist();
  }

  /**
   * Update state with a function (immutable-friendly)
   * @param {function(state):object} fn
   */
  update(fn, opts = { persist: true }) {
    try {
      const patch = fn({ ...this._state }) || {};
      this.set(patch, undefined, opts);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("State update error", err);
    }
  }

  /**
   * Subscribe to state changes. Handler receives (state, patch).
   * Returns an unsubscribe function.
   * @param {function} fn
   */
  subscribe(fn) {
    if (typeof fn !== "function") throw new TypeError("subscriber must be a function");
    this._subs.add(fn);
    // call immediately with current state
    try { fn({ ...this._state }, null); } catch (e) { /* swallow */ }
    return () => this._subs.delete(fn);
  }

  /**
   * Replace entire state (use carefully)
   * @param {object} newState
   */
  replace(newState = {}) {
    this._state = { ...this._state, ...newState, lastUpdated: Date.now() };
    this._notify({ replaced: true });
    this._schedulePersist();
  }

  /**
   * Clear persisted state (localStorage)
   */
  clearPersisted() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }

  /* -------------------------
     Internal helpers
     ------------------------- */

  _notify(patch) {
    const snapshot = { ...this._state };
    for (const fn of Array.from(this._subs)) {
      try { fn(snapshot, patch); } catch (err) { /* swallow subscriber errors */ }
    }
  }

  _schedulePersist() {
    if (this._persistDebounce) clearTimeout(this._persistDebounce);
    this._persistDebounce = setTimeout(() => this._persist(), this._persistDelay);
  }

  _persist() {
    try {
      const payload = JSON.stringify(this._state);
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("State persist failed", err);
    } finally {
      this._persistDebounce = null;
    }
  }

  _initFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        // merge but keep current defaults
        this._state = { ...this._state, ...parsed };
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to restore state from storage", err);
    }
  }

  /* -------------------------
     Optimistic helpers
     ------------------------- */

  /**
   * Apply an optimistic update while a promise resolves.
   * If the promise rejects, the state is rolled back.
   * @param {object} patch
   * @param {Promise} promise
   */
  optimistic(patch, promise) {
    if (!promise || typeof promise.then !== "function") {
      this.set(patch);
      return Promise.resolve();
    }
    const snapshot = { ...this._state };
    this._locked = true;
    this.set(patch);
    return promise
      .then((res) => {
        this._locked = false;
        this._notify({ optimistic: "committed" });
        return res;
      })
      .catch((err) => {
        this._locked = false;
        this._state = snapshot;
        this._notify({ optimistic: "reverted" });
        throw err;
      });
  }

  /* -------------------------
     Integration helpers for websocket messages
     ------------------------- */

  /**
   * Apply an incoming realtime patch. This method is defensive:
   * - merges arrays by id when possible
   * - ignores stale updates based on lastUpdated timestamp
   * @param {object} payload
   */
  applyRealtime(payload = {}) {
    if (!payload || typeof payload !== "object") return;
    // optional timestamp check
    if (payload.lastUpdated && this._state.lastUpdated && payload.lastUpdated <= this._state.lastUpdated) {
      return;
    }

    // handle common types
    if (payload.type === "course.updated" && payload.data) {
      const idx = this._state.courses.findIndex((c) => c.id === payload.data.id);
      if (idx !== -1) {
        this._state.courses[idx] = { ...this._state.courses[idx], ...payload.data };
      } else {
        // insert at front
        this._state.courses.unshift(payload.data);
      }
      this._state.lastUpdated = Date.now();
      this._notify({ realtime: payload.type, id: payload.data.id });
      this._schedulePersist();
      return;
    }

    if (payload.type === "courses.bulk" && Array.isArray(payload.data)) {
      // merge by id
      const map = new Map(this._state.courses.map((c) => [c.id, c]));
      for (const item of payload.data) {
        map.set(item.id, { ...(map.get(item.id) || {}), ...item });
      }
      this._state.courses = Array.from(map.values());
      this._state.lastUpdated = Date.now();
      this._notify({ realtime: payload.type });
      this._schedulePersist();
      return;
    }

    // generic merge for top-level keys
    const patch = { ...payload.data };
    delete patch.id;
    if (Object.keys(patch).length) {
      this._state = { ...this._state, ...patch, lastUpdated: Date.now() };
      this._notify({ realtime: payload.type });
      this._schedulePersist();
    }
  }
}

/* -------------------------
   Export a default singleton
   ------------------------- */
const state = new StateManager();
export { StateManager };
export default state;
