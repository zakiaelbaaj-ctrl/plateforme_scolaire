// public/js/pages/boot.js
// Senior+++ bootstrap for Plateforme Scolaire (Dashboard_eleve)
// - Single entry point for the student dashboard page
// - Responsible for wiring auth, http, websocket, UI, state, realtime, and page-level telemetry
// - Defensive: graceful degradation, timeouts, retries, clear logging, and minimal global surface
// - Usage: include as a module script on the dashboard page: <script type="module" src="/public/js/pages/boot.js"></script>

import auth from "../lib/auth.js";
import http from "../lib/http.js";
import { initWebSocket as initWsFactory } from "../Dashboard_eleve/websocket.js";
import ui, { initMatiereSelect, updateMatiereSelect } from "../Dashboard_eleve/ui.js";
import state from "../Dashboard_eleve/state.js";
import Timer from "../Dashboard_eleve/timer.js";
import notifications, { startNotificationSocket } from "../Dashboard_eleve/notification.js";
import WebRTC from "../Dashboard_eleve/webrtc.js";
import Dashboard from "../Dashboard_eleve/main.js";

/* ==========================================================================
   Configuration derived from the page (meta tags or global)
   ========================================================================== */
const CONFIG = {
  apiBase: window.API_BASE || (document.querySelector('meta[name="api-base"]')?.getAttribute("content")) || "/api",
  wsUrl: window.WS_URL || null, // optional override
  debug: Boolean(window.DEBUG),
  dashboardRootSelector: "#dashboard-root",
  matiereEndpoint: "/matieres", // fallback endpoint to fetch matieres if WS not available
};

/* ==========================================================================
   Small helpers
   ========================================================================== */
function log(...args) { if (CONFIG.debug) console.debug("[boot]", ...args); }
function warn(...args) { console.warn("[boot]", ...args); }

/* ==========================================================================
   Initialize modules and providers
   ========================================================================== */
http.setAuthProvider({
  getToken: async () => {
    // prefer auth module token, fallback to adminToken
    try {
      const t = auth.getAccessToken();
      if (t) return t;
    } catch (e) { /* ignore */ }
    try {
      return localStorage.getItem("adminToken");
    } catch (e) { return null; }
  },
  onAuthFail: async (response) => {
    // attempt a silent refresh via auth module
    try {
      const refreshed = await auth.restoreSessionSilently();
      return Boolean(refreshed);
    } catch (e) {
      return false;
    }
  },
});

/* ==========================================================================
   Boot sequence
   ========================================================================== */
async function boot() {
  try {
    // 1) Initialize auth module
    auth.init({ apiBase: CONFIG.apiBase, debug: CONFIG.debug });

    // 2) Restore session silently (non-blocking)
    try {
      await auth.restoreSessionSilently();
      log("session restored (if available)");
    } catch (e) {
      log("no session to restore or refresh failed");
    }

    // 3) Initialize UI helpers (matiere select placeholder)
    initMatiereSelect({ matieres: [], options: { autoSelect: false } });

    // 4) Initialize websocket (resilient controller)
    const wsController = initWsFactory({
      url: CONFIG.wsUrl, // if null, websocket.js will infer sensible default
      autoRequestMatieres: true,
      debug: CONFIG.debug,
    });

    // expose controller for debugging
    if (CONFIG.debug) window.__ps_ws = wsController;

    // 5) Start notification socket wiring (will call initWebSocket defensively)
    try {
      startNotificationSocket();
    } catch (e) {
      warn("notification socket failed to start", e);
    }

    // 6) Fetch matieres fallback (if websocket or server didn't push them)
    //    We attempt a best-effort fetch; failure is non-fatal.
    try {
      const matieres = await http.get("/matieres").catch(() => null);
      if (Array.isArray(matieres)) {
        updateMatiereSelect(matieres);
      }
    } catch (e) {
      log("matieres fetch fallback failed (non-fatal)", e);
    }

    // 7) Initialize Dashboard UI component
    const root = document.querySelector(CONFIG.dashboardRootSelector) || document.body;
    const dashboard = new Dashboard(root, { apiBase: CONFIG.apiBase, locale: "fr" });
    // attach to window for debugging in dev
    if (CONFIG.debug) window.__ps_dashboard = dashboard;

    await dashboard.init();

    // 8) Wire state subscriptions to UI telemetry and persistence
    state.subscribe((s, patch) => {
      // example: when courses change, log and update UI if needed
      if (patch && patch.realtime) {
        log("state realtime patch", patch);
      }
    });

    // 9) Initialize a page-level timer (example usage)
    const pageTimer = new Timer({ duration: 0, mode: "stopwatch", persistKey: "page-session", autoStart: false });
    // expose for debugging
    if (CONFIG.debug) window.__ps_timer = pageTimer;

    // 10) Initialize WebRTC helper (deferred)
    WebRTC.init({ debug: CONFIG.debug });

    // 11) Accessibility: focus main content for screen readers
    try {
      const main = document.querySelector("main");
      if (main && typeof main.focus === "function") main.setAttribute("tabindex", "-1"), main.focus();
    } catch (e) { /* ignore */ }

    // 12) Telemetry: simple page view event (best-effort)
    try {
      navigator.sendBeacon?.("/telemetry", JSON.stringify({ event: "page.view", page: "dashboard", ts: Date.now() })) ||
        fetch("/telemetry", { method: "POST", body: JSON.stringify({ event: "page.view", page: "dashboard" }), keepalive: true }).catch(() => {});
    } catch (e) { /* ignore */ }

    log("boot completed");
    return { dashboard, wsController, pageTimer };
  } catch (err) {
    // fatal boot error: show user-friendly message and log
    console.error("Boot failed", err);
    try {
      const root = document.querySelector(CONFIG.dashboardRootSelector) || document.body;
      const msg = document.createElement("div");
      msg.className = "boot-error";
      msg.textContent = "Une erreur est survenue lors du démarrage du tableau de bord. Réessayez plus tard.";
      root.innerHTML = "";
      root.appendChild(msg);
    } catch (e) { /* ignore */ }
    throw err;
  }
}

/* ==========================================================================
   Auto-run on DOMContentLoaded
   ========================================================================== */
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", () => {
    // run boot but do not block page rendering
    boot().catch(() => {});
  }, { once: true });
} else {
  // already ready
  boot().catch(() => {});
}

/* ==========================================================================
   Exports (for tests or manual control)
   ========================================================================== */
export default {
  boot,
};
