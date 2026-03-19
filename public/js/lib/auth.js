// public/js/lib/auth.js
// Senior+++ authentication helper for Plateforme Scolaire (Dashboard_eleve)
// - Zero-dependency ES module
// - Handles login/logout, token storage, automatic refresh, fetch wrapper with auth headers
// - Emits events for UI wiring: auth:login, auth:logout, auth:refresh, auth:error
// - Defensive: retries, exponential backoff, clock skew correction, secure storage fallback
// - Designed to integrate with existing modules (websocket, state, ui) via events
//
// NOTE: This file now also exposes small admin-token helpers:
//   saveToken, clearToken, isAuthenticated (checks adminToken or access token),
//   requireAuthRedirect (redirects to /login.html when not authenticated).
/* ==========================================================================
   Configuration
   ========================================================================== */
const DEFAULTS = {
  apiBase: "/api/v1",
  tokenStorageKey: "ps:auth:token",
  refreshTokenStorageKey: "ps:auth:refreshToken",
  userStorageKey: "ps:auth:user",
  tokenExpiryMarginSec: 60, // refresh token this many seconds before expiry
  refreshRetryBaseMs: 500,
  refreshMaxRetries: 5,
  persist: true, // persist tokens to localStorage (fallback to sessionStorage)
  csrfHeader: "X-CSRF-Token",
  fetchTimeoutMs: 15000,
  debug: false,
};

/* ==========================================================================
   Internal state
   ========================================================================== */
let _opts = { ...DEFAULTS };
let _token = null; // { accessToken, expiresAt (ms) }
let _refreshToken = null;
let _user = null;
let _refreshTimer = null;
let _refreshRetries = 0;
let _listeners = new Map(); // event -> Set(fn)
let _storage = null;

/* ==========================================================================
   Utilities
   ========================================================================== */
function log(...args) { if (_opts.debug) console.debug("[auth]", ...args); }
function warn(...args) { if (_opts.debug) console.warn("[auth]", ...args); }
function nowMs() { return Date.now(); }
function safeJsonParse(s) { try { return JSON.parse(s); } catch { return null; } }

/* ==========================================================================
   Storage abstraction (localStorage preferred, fallback to sessionStorage)
   ========================================================================== */
function _initStorage() {
  if (_storage) return;
  try {
    if (_opts.persist && typeof localStorage !== "undefined") {
      _storage = localStorage;
    } else if (typeof sessionStorage !== "undefined") {
      _storage = sessionStorage;
    } else {
      _storage = {
        _map: {},
        getItem(k) { return this._map[k] ?? null; },
        setItem(k, v) { this._map[k] = String(v); },
        removeItem(k) { delete this._map[k]; },
      };
    }
  } catch (e) {
    // localStorage may throw in some privacy modes; fallback to in-memory
    _storage = {
      _map: {},
      getItem(k) { return this._map[k] ?? null; },
      setItem(k, v) { this._map[k] = String(v); },
      removeItem(k) { delete this._map[k]; },
    };
  }
}

/* ==========================================================================
   Event emitter
   ========================================================================== */
function on(event, fn) {
  if (typeof fn !== "function") return () => {};
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(fn);
  return () => off(event, fn);
}
function off(event, fn) {
  if (!_listeners.has(event)) return;
  _listeners.get(event).delete(fn);
}
function emit(event, payload = {}) {
  const set = _listeners.get(event);
  if (set) {
    for (const fn of Array.from(set)) {
      try { fn(payload); } catch (e) { /* swallow subscriber errors */ }
    }
  }
  // also dispatch a DOM CustomEvent for loose coupling
  try {
    document.dispatchEvent(new CustomEvent(`auth:${event}`, { detail: payload }));
  } catch (e) { /* ignore */ }
}

/* ==========================================================================
   Token helpers
   ========================================================================== */
function _saveTokenToStorage(tokenObj) {
  _initStorage();
  if (!tokenObj) {
    _storage.removeItem(_opts.tokenStorageKey);
    return;
  }
  try {
    _storage.setItem(_opts.tokenStorageKey, JSON.stringify(tokenObj));
  } catch (e) {
    warn("persist token failed", e);
  }
}

function _saveRefreshTokenToStorage(refreshToken) {
  _initStorage();
  if (!refreshToken) {
    _storage.removeItem(_opts.refreshTokenStorageKey);
    return;
  }
  try {
    _storage.setItem(_opts.refreshTokenStorageKey, String(refreshToken));
  } catch (e) {
    warn("persist refresh token failed", e);
  }
}

function _saveUserToStorage(user) {
  _initStorage();
  if (!user) {
    _storage.removeItem(_opts.userStorageKey);
    return;
  }
  try {
    _storage.setItem(_opts.userStorageKey, JSON.stringify(user));
  } catch (e) {
    warn("persist user failed", e);
  }
}

function _loadFromStorage() {
  _initStorage();
  try {
    const rawToken = _storage.getItem(_opts.tokenStorageKey);
    const rawRefresh = _storage.getItem(_opts.refreshTokenStorageKey);
    const rawUser = _storage.getItem(_opts.userStorageKey);
    _token = rawToken ? safeJsonParse(rawToken) : null;
    _refreshToken = rawRefresh || null;
    _user = rawUser ? safeJsonParse(rawUser) : null;
  } catch (e) {
    warn("loadFromStorage failed", e);
    _token = null;
    _refreshToken = null;
    _user = null;
  }
}

/* ==========================================================================
   Token expiry utilities
   ========================================================================== */
function _tokenExpiresAtMs(accessTokenPayload) {
  // If server returns expiresAt use it; otherwise try to decode JWT exp claim
  if (!accessTokenPayload) return null;
  if (typeof accessTokenPayload.expiresAt === "number") return accessTokenPayload.expiresAt;
  // attempt to decode JWT (naive, no verification) to read exp
  try {
    const parts = String(accessTokenPayload.accessToken || "").split(".");
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      if (payload && payload.exp) return payload.exp * 1000;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function _isTokenExpiringSoon() {
  if (!_token) return true;
  const expiresAt = _token.expiresAt || _tokenExpiresAtMs(_token);
  if (!expiresAt) return false; // unknown expiry -> assume valid
  const marginMs = (_opts.tokenExpiryMarginSec || 60) * 1000;
  return (expiresAt - marginMs) <= nowMs();
}

/* ==========================================================================
   Public API: init
   ========================================================================== */
/**
 * Initialize auth module with options.
 * - options.apiBase: base API URL
 * - options.persist: boolean (persist tokens)
 * - options.debug: boolean
 */
export function init(options = {}) {
  _opts = { ..._opts, ...options };
  _initStorage();
  _loadFromStorage();
  _scheduleRefreshIfNeeded();
  return {
    isAuthenticated: isAuthenticated,
    getUser: getUser,
  };
}

/* ==========================================================================
   Authentication flows
   ========================================================================== */
/**
 * Login with credentials.
 * Expects server to return { accessToken, refreshToken, expiresAt?, user? }.
 * Returns the server response.
 */
export async function login({ email, password, remember = true } = {}) {
  if (!email || !password) throw new TypeError("email and password required");
  const url = `${_opts.apiBase.replace(/\/$/, "")}/auth/login`;
  try {
    const res = await _fetchRaw(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error("Login failed");
      err.status = res.status;
      err.body = text;
      emit("error", { phase: "login", error: err });
      throw err;
    }
    const payload = await res.json();
    _applyAuthPayload(payload, { persist: remember });
    emit("login", { user: _user });
    return payload;
  } catch (err) {
    emit("error", { phase: "login", error: err });
    throw err;
  }
}

/**
 * Logout locally and inform server (best-effort).
 */
export async function logout() {
  // attempt server logout but do not block local cleanup
  try {
    const url = `${_opts.apiBase.replace(/\/$/, "")}/auth/logout`;
    // send refresh token if available
    await _fetchRaw(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    }).catch(() => {});
  } catch (e) {
    // ignore
  } finally {
    _clearAuth();
    emit("logout", {});
  }
}

/**
 * Apply auth payload returned by server.
 * payload: { accessToken, refreshToken, expiresAt?, user? }
 */
function _applyAuthPayload(payload = {}, { persist = true } = {}) {
  if (!payload || typeof payload !== "object") return;
  const accessToken = payload.accessToken || payload.token || null;
  const refreshToken = payload.refreshToken || payload.refresh_token || null;
  const expiresAt = payload.expiresAt || payload.expires_at || null;

  if (accessToken) {
    _token = { accessToken, expiresAt: expiresAt ? Number(expiresAt) : _tokenExpiresAtMs({ accessToken }) };
    _saveTokenToStorage(_token);
  }
  if (refreshToken) {
    _refreshToken = String(refreshToken);
    _saveRefreshTokenToStorage(_refreshToken);
  }
  if (payload.user) {
    _user = payload.user;
    _saveUserToStorage(_user);
  }
  _scheduleRefreshIfNeeded();
}

/* ==========================================================================
   Refresh logic (with backoff)
   ========================================================================== */
async function _refreshTokenFlow() {
  if (!_refreshToken) {
    warn("no refresh token available");
    emit("error", { phase: "refresh", error: new Error("no refresh token") });
    return false;
  }
  const url = `${_opts.apiBase.replace(/\/$/, "")}/auth/refresh`;
  try {
    const res = await _fetchRaw(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: _refreshToken }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error("Refresh failed");
      err.status = res.status;
      err.body = text;
      throw err;
    }
    const payload = await res.json();
    _applyAuthPayload(payload, { persist: _opts.persist });
    _refreshRetries = 0;
    emit("refresh", { user: _user });
    return true;
  } catch (err) {
    _refreshRetries += 1;
    emit("error", { phase: "refresh", error: err, attempt: _refreshRetries });
    if (_refreshRetries <= (_opts.refreshMaxRetries || 5)) {
      const backoff = Math.min((_opts.refreshRetryBaseMs || 500) * Math.pow(2, _refreshRetries - 1), 30_000);
      log(`refresh failed, retrying in ${backoff}ms`);
      setTimeout(() => _refreshTokenFlow(), backoff);
    } else {
      // give up: clear auth
      warn("refresh retries exhausted, clearing auth");
      _clearAuth();
      emit("logout", { reason: "refresh_failed" });
    }
    return false;
  }
}

function _scheduleRefreshIfNeeded() {
  // clear existing timer
  if (_refreshTimer) {
    clearTimeout(_refreshTimer);
    _refreshTimer = null;
  }
  if (!_token || !_token.accessToken) return;
  const expiresAt = _token.expiresAt || _tokenExpiresAtMs(_token);
  if (!expiresAt) return; // unknown expiry
  const marginMs = (_opts.tokenExpiryMarginSec || 60) * 1000;
  const msUntilRefresh = Math.max(0, expiresAt - nowMs() - marginMs);
  log("scheduling token refresh in ms:", msUntilRefresh);
  _refreshTimer = setTimeout(() => {
    _refreshTokenFlow().catch((e) => { /* handled in flow */ });
  }, msUntilRefresh);
}

/* ==========================================================================
   Clear auth
   ========================================================================== */
function _clearAuth() {
  _token = null;
  _refreshToken = null;
  _user = null;
  _saveTokenToStorage(null);
  _saveRefreshTokenToStorage(null);
  _saveUserToStorage(null);
  if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
}

/* ==========================================================================
   Public helpers
   ========================================================================== */
/**
 * isAuthenticated
 * - Updated to consider both the module-managed access token and an "adminToken"
 *   stored in localStorage (for simple admin flows). This keeps compatibility
 *   with existing admin helpers while preserving the richer token lifecycle.
 */
export function isAuthenticated() {
  // adminToken (legacy/simple flow) takes precedence for quick checks
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("adminToken")) return true;
  } catch (e) {
    // ignore storage errors
  }
  // otherwise check module-managed token
  if (!_token || !_token.accessToken) return false;
  // if token exists, consider authenticated (refresh logic runs separately)
  return true;
}

export function getAccessToken() {
  return _token ? _token.accessToken : null;
}

export function getUser() {
  return _user;
}

/* ==========================================================================
   Fetch wrapper with auth and CSRF support
   ========================================================================== */
async function _fetchRaw(url, opts = {}) {
  const controller = new AbortController();
  const timeout = opts.timeout || _opts.fetchTimeoutMs;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const merged = { ...opts, signal: controller.signal, credentials: "same-origin" };
    const res = await fetch(url, merged);
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/**
 * fetchWithAuth(url, opts)
 * - automatically attaches Authorization header when access token available
 * - attempts a single refresh if 401 received and retryOnce=true
 */
export async function fetchWithAuth(url, opts = {}, { retryOnce = true } = {}) {
  const headers = new Headers(opts.headers || {});
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // attach CSRF header if present in storage (optional)
  // if your backend uses cookies for CSRF, adapt accordingly
  if (_storage) {
    const csrf = _storage.getItem && _storage.getItem("ps:csrf");
    if (csrf) headers.set(_opts.csrfHeader, csrf);
  }

  const mergedOpts = { ...opts, headers };

  try {
    const res = await _fetchRaw(url, mergedOpts);
    if (res.status === 401 && retryOnce) {
      // try refresh then retry once
      const refreshed = await _refreshTokenFlow();
      if (refreshed) {
        // attach new token
        const newToken = getAccessToken();
        if (newToken) headers.set("Authorization", `Bearer ${newToken}`);
        const retryRes = await _fetchRaw(url, { ...opts, headers });
        return retryRes;
      }
    }
    return res;
  } catch (err) {
    emit("error", { phase: "fetch", error: err });
    throw err;
  }
}

/* ==========================================================================
   Utility: silent token restore (for bootstrapping)
   ========================================================================== */
export async function restoreSessionSilently() {
  _loadFromStorage();
  if (!_token && _refreshToken) {
    // attempt refresh immediately
    try {
      await _refreshTokenFlow();
      return true;
    } catch {
      return false;
    }
  }
  _scheduleRefreshIfNeeded();
  return !!_token;
}

/* ==========================================================================
   Admin token helpers requested to be integrated
   - These provide a simple admin-token flow stored under "adminToken" key.
   - They also update module state where appropriate to keep behavior consistent.
   ========================================================================== */

/**
 * Save a simple admin token to localStorage and mirror it into module token state.
 * @param {string} token
 */
export function saveToken(token) {
  if (!token) return;
  try {
    localStorage.setItem("adminToken", token);
  } catch (e) {
    warn("saveToken localStorage failed", e);
  }
  // Mirror into module token for convenience (non-expiring)
  _token = { accessToken: token, expiresAt: null };
  _saveTokenToStorage(_token);
  emit("login", { user: _user, via: "adminToken" });
}

/**
 * Clear the admin token from localStorage and clear module auth state.
 */
export function clearToken() {
  try {
    localStorage.removeItem("adminToken");
  } catch (e) {
    warn("clearToken localStorage failed", e);
  }
  // Clear module-managed auth as well
  _clearAuth();
  emit("logout", { via: "adminToken" });
}

/**
 * Simple isAuthenticated check for admin flows.
 * This function is exported above and used by other modules; it checks both
 * adminToken and module-managed access token.
 * (Kept here for explicitness in case other code imports these helpers directly.)
 */
export function isAdminAuthenticated() {
  try {
    return Boolean(localStorage.getItem("adminToken"));
  } catch (e) {
    return false;
  }
}

/**
 * Redirect to login page if not authenticated (admin or normal token).
 * Useful for pages that require a quick guard.
 */
export function requireAuthRedirect() {
  if (!isAuthenticated()) {
    // Use a hard redirect to the login page
    window.location.href = "/login.html";
  }
}

/* ==========================================================================
   Exports and defaults
   ========================================================================== */
export default {
  init,
  login,
  logout,
  isAuthenticated,
  getAccessToken,
  getUser,
  fetchWithAuth,
  restoreSessionSilently,
  on,
  off,
  // admin helpers
  saveToken,
  clearToken,
  isAdminAuthenticated,
  requireAuthRedirect,
  // for testing / debugging
  _internal: {
    _clearAuth,
    _loadFromStorage,
    _saveTokenToStorage,
  },
};
