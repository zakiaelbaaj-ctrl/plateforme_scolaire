// public/js/pages/login.js
// Senior+++ login page script for Plateforme Scolaire
// - ES module, zero external deps beyond local libs
// - Accessible form handling, client-side validation, progressive enhancement
// - Integrates with lib/auth, lib/http and lib/dom utilities
// - Supports "remember me" (persist tokens), adminToken quick flow, redirect after login
// - Defensive: timeouts, error handling, telemetry hook, and clear UX states

import auth from "../lib/auth.js";
import http from "../lib/http.js";
import * as dom from "../lib/dom.js";

/* ==========================================================================
   Configuration
   ========================================================================== */
const CONFIG = {
  apiBase: window.API_BASE || "/api",
  loginEndpoint: "/auth/login",
  redirectAfterLogin: window.LOGIN_REDIRECT || "/dashboard.html",
  debug: Boolean(window.DEBUG),
  minPasswordLength: 6,
};

/* ==========================================================================
   Helpers
   ========================================================================== */
function log(...args) {
  if (CONFIG.debug) console.debug("[login]", ...args);
}

function showError(message) {
  dom.showToast(message, { duration: 6000 });
}

/* ==========================================================================
   Validation
   ========================================================================== */
function validateCredentials({ email, password }) {
  const errors = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Adresse e‑mail invalide.");
  if (!password || String(password).length < CONFIG.minPasswordLength) errors.push(`Le mot de passe doit contenir au moins ${CONFIG.minPasswordLength} caractères.`);
  return errors;
}

/* ==========================================================================
   UI wiring
   ========================================================================== */
function getFormElements(root = document) {
  return {
    form: dom.qs("#loginForm", root),
    email: dom.qs("#email", root),
    password: dom.qs("#password", root),
    remember: dom.qs("#remember", root),
    submit: dom.qs("#loginSubmit", root),
    errorBox: dom.qs("#loginError", root),
  };
}

function setLoading(state, els) {
  if (!els) return;
  els.submit.disabled = state;
  els.form.classList.toggle("is-loading", state);
  if (state) {
    els.submit.setAttribute("aria-busy", "true");
  } else {
    els.submit.removeAttribute("aria-busy");
  }
}

/* ==========================================================================
   Core: perform login
   ========================================================================== */
async function performLogin({ email, password, remember }, els) {
  setLoading(true, els);
  try {
    // Use auth.login which handles token persistence and refresh scheduling
    const payload = await auth.login({ email, password, remember });
    // If server returned an admin-like token or the app expects adminToken flow,
    // mirror it for compatibility (non-blocking).
    if (payload && payload.adminToken) {
      try { auth.saveToken(payload.adminToken); } catch (e) { log("saveToken failed", e); }
    }

    // Telemetry: best-effort page view / login event
    try {
      navigator.sendBeacon?.("/telemetry", JSON.stringify({ event: "auth.login", ts: Date.now() })) ||
        fetch("/telemetry", { method: "POST", body: JSON.stringify({ event: "auth.login" }), keepalive: true }).catch(() => {});
    } catch (e) { /* ignore */ }

    // Redirect to intended page
    const redirect = new URLSearchParams(location.search).get("next") || CONFIG.redirectAfterLogin;
    location.href = redirect;
  } catch (err) {
    log("login error", err);
    const message = (err && err.message) ? err.message : "Échec de la connexion.";
    // show friendly message
    if (els && els.errorBox) {
      els.errorBox.textContent = message;
      els.errorBox.classList.add("visible");
      els.errorBox.setAttribute("role", "alert");
    } else {
      showError(message);
    }
    // clear password field for security
    if (els && els.password) els.password.value = "";
    throw err;
  } finally {
    setLoading(false, els);
  }
}

/* ==========================================================================
   Progressive enhancement: attach handlers
   ========================================================================== */
function attachFormHandler(root = document) {
  const els = getFormElements(root);
  if (!els.form) return;

  // hide error box initially
  if (els.errorBox) {
    els.errorBox.textContent = "";
    els.errorBox.classList.remove("visible");
  }

  // client-side submit handler
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!els.email || !els.password) return;

    const creds = {
      email: els.email.value.trim(),
      password: els.password.value,
      remember: Boolean(els.remember && els.remember.checked),
    };

    // validation
    const errors = validateCredentials(creds);
    if (errors.length) {
      const msg = errors.join(" ");
      if (els.errorBox) {
        els.errorBox.textContent = msg;
        els.errorBox.classList.add("visible");
        els.errorBox.setAttribute("role", "alert");
      } else {
        showError(msg);
      }
      return;
    }

    // clear previous error
    if (els.errorBox) {
      els.errorBox.textContent = "";
      els.errorBox.classList.remove("visible");
    }

    try {
      await performLogin(creds, els);
    } catch (err) {
      // error already handled in performLogin
    }
  };

  // attach and keep reference to allow removal if needed
  els.form.addEventListener("submit", onSubmit);

  // keyboard accessibility: Enter on inputs triggers submit naturally
  // quick admin-token shortcut: Ctrl+Shift+A to paste adminToken from clipboard (dev convenience)
  const onKey = async (ev) => {
    if (ev.ctrlKey && ev.shiftKey && ev.key.toLowerCase() === "a") {
      try {
        const text = await navigator.clipboard.readText();
        if (text && text.startsWith("admin:")) {
          const token = text.replace(/^admin:/, "").trim();
          auth.saveToken(token);
          dom.showToast("Admin token appliqué. Redirection…", { duration: 2000 });
          setTimeout(() => location.reload(), 600);
        }
      } catch (e) {
        log("clipboard read failed", e);
      }
    }
  };
  document.addEventListener("keydown", onKey);

  // expose cleanup if needed
  return () => {
    els.form.removeEventListener("submit", onSubmit);
    document.removeEventListener("keydown", onKey);
  };
}

/* ==========================================================================
   Auto-init on DOMContentLoaded
   ========================================================================== */
function init() {
  // initialize auth module (non-blocking)
  auth.init({ apiBase: CONFIG.apiBase, debug: CONFIG.debug });

  // wire auth provider for http helper
  http.setAuthProvider?.({
    getToken: async () => auth.getAccessToken() || (localStorage.getItem ? localStorage.getItem("adminToken") : null),
    onAuthFail: async () => {
      // try silent refresh
      try {
        return await auth.restoreSessionSilently();
      } catch (e) {
        return false;
      }
    },
  });

  // attach form handlers
  attachFormHandler(document);

  // focus first input for accessibility
  const email = dom.qs("#email");
  if (email && typeof email.focus === "function") {
    email.focus();
  }

  // if already authenticated, redirect away
  try {
    if (auth.isAuthenticated()) {
      // small delay to allow page to show a message if desired
      dom.showToast("Vous êtes déjà connecté. Redirection…", { duration: 1200 });
      setTimeout(() => {
        const redirect = new URLSearchParams(location.search).get("next") || CONFIG.redirectAfterLogin;
        location.href = redirect;
      }, 900);
    }
  } catch (e) {
    log("isAuthenticated check failed", e);
  }
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}

/* ==========================================================================
   Exports (for tests or manual control)
   ========================================================================== */
export default {
  init,
  performLogin,
  validateCredentials,
};
