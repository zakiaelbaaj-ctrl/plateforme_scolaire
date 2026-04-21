// public/js/lib/http.js
// Senior+++ HTTP helper for Plateforme Scolaire
// - Robust fetch wrapper with timeouts, JSON handling, retries with exponential backoff,
//   automatic Authorization header, optional token refresh hook, query helpers, and typed errors.
// - Small footprint, zero external deps, designed for pages and components in Dashboard_eleve.
// - Exports: request, get, post, put, del, stream, buildQuery, setAuthProvider, clearAuthProvider

/* ===========================
   Configuration
   =========================== */
const DEFAULT_TIMEOUT = 15_000; // ms
const DEFAULT_RETRY = { retries: 2, baseDelay: 300, maxDelay: 5000, retryOn: [502, 503, 504] };

/* ===========================
   Internal state
   =========================== */
let _authProvider = null; // optional: { getToken: async ()=>string|null, onAuthFail: async ()=>boolean }

/* ===========================
   Utilities
   =========================== */
function isJsonContentType(headers) {
  const ct = headers.get?.("content-type") || headers["content-type"] || "";
  return ct.includes("application/json");
}

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function buildUrl(base, path) {
  // ensure single slash between base and path
  if (!base) return path;
  return `${base.replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
}

export function buildQuery(params = {}) {
  const entries = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (Array.isArray(v)) return v.map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`).join("&");
      return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
    });
  return entries.length ? `?${entries.join("&")}` : "";
}

/* ===========================
   Error types
   =========================== */
export class HTTPError extends Error {
  constructor(message, { status = null, body = null, url = null } = {}) {
    super(message);
    this.name = "HTTPError";
    this.status = status;
    this.body = body;
    this.url = url;
  }
}

export class TimeoutError extends Error {
  constructor(message = "Request timeout") {
    super(message);
    this.name = "TimeoutError";
  }
}

/* ===========================
   Auth provider integration
   =========================== */
/**
 * setAuthProvider(provider)
 * provider: {
 *   getToken: async () => string|null,
 *   onAuthFail: async (response) => boolean  // optional: attempt refresh, return true if retried successfully
 * }
 */
export function setAuthProvider(provider) {
  _authProvider = provider && typeof provider.getToken === "function" ? provider : null;
}

export function clearAuthProvider() {
  _authProvider = null;
}

/* ===========================
   Timeout wrapper
   =========================== */
function withTimeout(promise, ms) {
  if (!ms) return promise;
  let timer;
  const wrapped = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then((v) => {
      clearTimeout(timer);
      resolve(v);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
  return wrapped;
}

/* ===========================
   Core request implementation
   =========================== */
/**
 * request(path, { method, headers, body, timeout, base, retries, retryOn, signal })
 * - path: string (relative path) or full URL
 * - base: optional base URL (defaults to window.API_BASE || '/api')
 * - body: object | FormData | null
 * - retries: number of retry attempts (default from DEFAULT_RETRY)
 * - retryOn: array of status codes to retry on
 * - onResponse: optional callback (response) => void
 */
export async function request(
  path,
  {
    method = "GET",
    headers = {},
    body = null,
    timeout = DEFAULT_TIMEOUT,
    base = window.API_BASE || "/api",
    retries = DEFAULT_RETRY.retries,
    baseDelay = DEFAULT_RETRY.baseDelay,
    maxDelay = DEFAULT_RETRY.maxDelay,
    retryOn = DEFAULT_RETRY.retryOn,
    signal = null,
    onResponse = null,
  } = {}
) {
  const url = path.startsWith("http://") || path.startsWith("https://") ? path : buildUrl(base, path);
  let attempt = 0;

  // prepare body and headers
  const isForm = body instanceof FormData;
  const defaultHeaders = { Accept: "application/json" };
  if (body && !isForm) defaultHeaders["Content-Type"] = "application/json";

  // attach auth token if provider available
  let token = null;
  if (_authProvider && typeof _authProvider.getToken === "function") {
    try {
      token = await _authProvider.getToken();
    } catch (e) {
      // ignore token retrieval errors; proceed without token
      token = null;
    }
  } else {
    // fallback to legacy adminToken in localStorage for compatibility
    try {
      token = token || (localStorage && localStorage.getItem && localStorage.getItem("adminToken"));
    } catch (e) {
      token = null;
    }
  }

  if (token) defaultHeaders["Authorization"] = `Bearer ${token}`;

  // prepare fetch options
  const optsBase = {
    method,
    headers: { ...defaultHeaders, ...headers },
    credentials: "same-origin",
    signal,
  };

  if (body) optsBase.body = isForm ? body : JSON.stringify(body);

  // retry loop with exponential backoff
  while (true) {
    attempt += 1;
    try {
      const fetchPromise = fetch(url, optsBase);
      const res = await withTimeout(fetchPromise, timeout);

      // optional response hook
      if (typeof onResponse === "function") {
        try { onResponse(res); } catch (e) { /* swallow */ }
      }

      // parse body safely
      const text = await res.text().catch(() => "");
      let parsed = null;
      if (text) {
        try { parsed = JSON.parse(text); } catch (e) { parsed = text; }
      }

      if (!res.ok) {
        // if 401 and auth provider supports onAuthFail, attempt refresh once
        if (res.status === 401 && _authProvider && typeof _authProvider.onAuthFail === "function") {
          try {
            const refreshed = await _authProvider.onAuthFail(res);
            if (refreshed) {
              // update token header and retry immediately (only once)
              const newToken = await _authProvider.getToken();
              if (newToken) optsBase.headers["Authorization"] = `Bearer ${newToken}`;
              // retry without consuming a retry attempt from the configured retries
              continue;
            }
          } catch (e) {
            // ignore and proceed to error handling below
          }
        }

        // decide whether to retry based on status
        if (attempt <= retries && retryOn.includes(res.status)) {
          const delay = Math.min(maxDelay, Math.round(baseDelay * Math.pow(2, attempt - 1)));
          await sleep(delay + Math.floor(Math.random() * 100));
          continue;
        }

        const message = (parsed && (parsed.message || parsed.error)) || text || `HTTP ${res.status}`;
        throw new HTTPError(message, { status: res.status, body: parsed, url });
      }

      // success: return parsed JSON or raw text
      return parsed;
    } catch (err) {
      // timeout handling
      if (err instanceof TimeoutError) {
        if (attempt <= retries) {
          const delay = Math.min(maxDelay, Math.round(baseDelay * Math.pow(2, attempt - 1)));
          await sleep(delay + Math.floor(Math.random() * 100));
          continue;
        }
        throw err;
      }

      // network errors or other fetch errors: retry if attempts remain
      const isNetworkError = err instanceof TypeError || /network|failed/i.test(String(err.message));
      if (isNetworkError && attempt <= retries) {
        const delay = Math.min(maxDelay, Math.round(baseDelay * Math.pow(2, attempt - 1)));
        await sleep(delay + Math.floor(Math.random() * 100));
        continue;
      }

      // otherwise rethrow as HTTPError for consistency
      if (err instanceof HTTPError) throw err;
      throw new HTTPError(err.message || "Network error", { status: null, body: null, url });
    }
  }
}

/* ===========================
   Convenience wrappers
   =========================== */
export async function get(path, opts = {}) {
  return request(path, { ...opts, method: "GET" });
}
export async function post(path, body = null, opts = {}) {
  return request(path, { ...opts, method: "POST", body });
}
export async function put(path, body = null, opts = {}) {
  return request(path, { ...opts, method: "PUT", body });
}
export async function del(path, opts = {}) {
  return request(path, { ...opts, method: "DELETE" });
}

/* ===========================
   Streaming helper (fetch + ReadableStream)
   =========================== */
/**
 * stream(path, { onChunk, onComplete, onError, ...fetchOpts })
 * - onChunk receives Uint8Array chunks (or string if decode=true)
 */
export async function stream(path, { onChunk, onComplete, onError, decode = true, base = window.API_BASE || "/api", ...fetchOpts } = {}) {
  const url = path.startsWith("http://") || path.startsWith("https://") ? path : buildUrl(base, path);
  try {
    const res = await fetch(url, { ...fetchOpts, credentials: "same-origin" });
    if (!res.ok) throw new HTTPError(`HTTP ${res.status}`, { status: res.status, url });
    if (!res.body) {
      // no streaming support
      const text = await res.text();
      if (onChunk) onChunk(decode ? text : new TextEncoder().encode(text));
      if (onComplete) onComplete();
      return;
    }
    const reader = res.body.getReader();
    const decoder = decode ? new TextDecoder() : null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (onChunk) onChunk(decode ? decoder.decode(value, { stream: true }) : value);
    }
    if (onComplete) onComplete();
  } catch (err) {
    if (onError) onError(err);
    else throw err;
  }
}

/* ===========================
   Default export (convenience)
   =========================== */
export default {
  request,
  get,
  post,
  put,
  del,
  stream,
  buildQuery,
  setAuthProvider,
  clearAuthProvider,
  HTTPError,
  TimeoutError,
};

