/**
 * public/js/Dashboard_eleve/main.js
 *
 * Senior+++ entry for the student dashboard
 * - ESM module, zero external deps
 * - Progressive: lazy-loads heavy modules, supports offline, reconnects WebSocket
 * - Accessible UI interactions, ARIA updates, keyboard shortcuts
 * - Clear separation: state, view, api, realtime, telemetry
 * - Defensive: timeouts, retries, graceful degradation
 *
 * Note: this version adds a small global websocket initializer import and
 * a DOMContentLoaded hook that calls initWebSocket() as requested.
 */

import { initWebSocket } from "./websocket.js"; // <-- added import

const DEFAULTS = {
  apiBase: "/api/v1",
  locale: "fr",
  pageSize: 12,
  reconnectInterval: 3000,
  maxReconnectAttempts: 10,
  enableTelemetry: true,
  wsPath: "/ws/dashboard",
};

function qs(sel, root = document) {
  return root.querySelector(sel);
}
function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return node;
}

/* -------------------------
   Lightweight fetch wrapper
   ------------------------- */
async function apiFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = opts.timeout || 10000;
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { credentials: "same-origin", signal: controller.signal, ...opts });
    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(res.statusText || "API error");
      err.status = res.status;
      err.body = text;
      throw err;
    }
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return res.json();
    return res.text();
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/* -------------------------
   Simple telemetry (no PII)
   ------------------------- */
const Telemetry = {
  send(event, payload = {}) {
    if (!this.enabled) return;
    navigator.sendBeacon?.("/telemetry", JSON.stringify({ event, payload, ts: Date.now() })) ||
      fetch("/telemetry", { method: "POST", body: JSON.stringify({ event, payload }), keepalive: true }).catch(() => {});
  },
  enabled: DEFAULTS.enableTelemetry,
};

/* -------------------------
   Dashboard class
   ------------------------- */
export default class Dashboard {
  constructor(root, options = {}) {
    if (!root) throw new Error("Dashboard root element required");
    this.root = typeof root === "string" ? document.querySelector(root) : root;
    this.opts = { ...DEFAULTS, ...options };
    this.state = {
      user: null,
      courses: [],
      page: 1,
      pageSize: this.opts.pageSize,
      total: 0,
      loading: false,
      wsConnected: false,
    };

    this._ws = null;
    this._reconnectAttempts = 0;
    this._bound = {
      onResize: this._onResize.bind(this),
      onKeyDown: this._onKeyDown.bind(this),
      onVisibility: this._onVisibilityChange.bind(this),
    };

    // DOM refs
    this.refs = {
      list: null,
      pager: null,
      status: null,
      search: null,
    };
  }

  /* -------------------------
     Public API
     ------------------------- */
  async init() {
    this._renderSkeleton();
    this._attachGlobalListeners();
    await this._loadInitialData();
    this._hydrateUI();
    this._initRealtime();
    this._registerServiceWorker();
    Telemetry.send("dashboard.init", { locale: this.opts.locale });
  }

  destroy() {
    this._detachGlobalListeners();
    this._closeWs();
    this.root.innerHTML = "";
  }

  /* -------------------------
     UI rendering
     ------------------------- */
  _renderSkeleton() {
    this.root.innerHTML = "";
    const header = el("header", { class: "dashboard-header", role: "banner" }, [
      el("h1", { text: "Tableau de bord" }),
      el("div", { class: "dashboard-controls" }, [
        (this.refs.search = el("input", { class: "input search", type: "search", placeholder: "Rechercher un cours", "aria-label": "Rechercher" })),
      ]),
    ]);

    const main = el("main", { class: "dashboard-main", role: "main" }, [
      (this.refs.status = el("div", { class: "dashboard-status", "aria-live": "polite", text: "" })),
      (this.refs.list = el("section", { class: "course-list", "aria-label": "Liste des cours" })),
      (this.refs.pager = el("nav", { class: "dashboard-pager", "aria-label": "Pagination" })),
    ]);

    this.root.appendChild(header);
    this.root.appendChild(main);

    // keyboard shortcut hint (accessible)
    const hint = el("div", { class: "sr-only", "aria-hidden": "true", text: "Raccourcis: / pour focus recherche, n/p pour page suivante/précédente" });
    this.root.appendChild(hint);

    // wire search
    this.refs.search.addEventListener("input", this._debounce((e) => this._onSearch(e.target.value), 300));
    this.refs.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") e.target.value = "";
    });
  }

  _hydrateUI() {
    this._renderCourses();
    this._renderPager();
    this._updateStatus();
  }

  _renderCourses() {
    const list = this.refs.list;
    list.innerHTML = "";
    const { courses } = this.state;
    if (!courses.length) {
      list.appendChild(el("div", { class: "empty", text: "Aucun cours trouvé." }));
      return;
    }

    const grid = el("div", { class: "grid cols-3" });
    courses.forEach((c) => {
      const card = el("article", { class: "card course-card", tabindex: "0", "data-course-id": c.id, role: "article" }, [
        el("header", { class: "card-header" }, [
          el("h2", { class: "card-title", text: c.title }),
          el("p", { class: "card-sub", text: c.teacher || "" }),
        ]),
        el("div", { class: "card-body" }, [
          el("p", { class: "muted", text: c.summary || "" }),
        ]),
        el("footer", { class: "card-footer" }, [
          el("button", { class: "btn btn-primary", type: "button", "data-action": "open", "aria-label": `Ouvrir ${c.title}` }, ["Ouvrir"]),
          el("button", { class: "btn btn-ghost", type: "button", "data-action": "materials", "aria-label": `Matériel ${c.title}` }, ["Matériel"]),
        ]),
      ]);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter") card.querySelector("[data-action=open]")?.click();
      });
      card.addEventListener("click", (e) => this._onCourseClick(e, c));
      grid.appendChild(card);
    });
    list.appendChild(grid);
  }

  _renderPager() {
    const pager = this.refs.pager;
    pager.innerHTML = "";
    const totalPages = Math.max(1, Math.ceil(this.state.total / this.state.pageSize));
    const cur = this.state.page;

    const prev = el("button", { class: "btn btn-ghost", "data-page": String(Math.max(1, cur - 1)), type: "button", "aria-label": "Page précédente" }, ["Précédent"]);
    const next = el("button", { class: "btn btn-ghost", "data-page": String(Math.min(totalPages, cur + 1)), type: "button", "aria-label": "Page suivante" }, ["Suivant"]);
    prev.disabled = cur === 1;
    next.disabled = cur === totalPages;

    pager.appendChild(prev);

    const start = Math.max(1, cur - 2);
    const end = Math.min(totalPages, cur + 2);
    for (let p = start; p <= end; p++) {
      const btn = el("button", { class: p === cur ? "btn btn-primary" : "btn btn-ghost", "data-page": String(p), type: "button", "aria-current": p === cur ? "page" : null }, [String(p)]);
      pager.appendChild(btn);
    }

    pager.appendChild(next);

    pager.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-page]");
      if (!btn) return;
      const page = Number(btn.dataset.page);
      if (!Number.isNaN(page)) this._goToPage(page);
    });
  }

  _updateStatus(message = "") {
    this.refs.status.textContent = message || (this.state.loading ? "Chargement…" : "");
    this.refs.status.classList.toggle("is-loading", this.state.loading);
  }

  /* -------------------------
     Data loading
     ------------------------- */
  async _loadInitialData() {
    this.state.loading = true;
    this._updateStatus("Chargement des cours…");
    try {
      const url = `${this.opts.apiBase}/students/me`;
      const user = await apiFetch(url);
      this.state.user = user;
      await this._fetchCourses();
    } catch (err) {
      console.error("Initial load failed", err);
      this._updateStatus("Impossible de charger le tableau de bord.");
      Telemetry.send("dashboard.load.error", { message: err.message, status: err.status || null });
    } finally {
      this.state.loading = false;
      this._updateStatus();
    }
  }

  async _fetchCourses({ page = this.state.page, pageSize = this.state.pageSize, q = "" } = {}) {
    this.state.loading = true;
    this._updateStatus("Chargement des cours…");
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (q) params.set("q", q);
      const url = `${this.opts.apiBase}/students/courses?${params.toString()}`;
      const payload = await apiFetch(url);
      this.state.courses = Array.isArray(payload.items) ? payload.items : [];
      this.state.total = Number(payload.total) || this.state.courses.length;
      this.state.page = page;
      this._hydrateUI();
    } catch (err) {
      console.error("Fetch courses failed", err);
      this._updateStatus("Erreur lors du chargement des cours.");
      Telemetry.send("dashboard.courses.error", { message: err.message, status: err.status || null });
    } finally {
      this.state.loading = false;
      this._updateStatus();
    }
  }

  /* -------------------------
     Realtime (WebSocket) with reconnect
     ------------------------- */
  _initRealtime() {
    if (!("WebSocket" in window)) return;
    const scheme = location.protocol === "https:" ? "wss" : "ws";
    const url = `${scheme}://${location.host}${this.opts.wsPath}`;
    this._connectWs(url);
    document.addEventListener("visibilitychange", this._bound.onVisibility);
  }

  _connectWs(url) {
    if (this._ws) this._closeWs();
    try {
      this._ws = new WebSocket(url);
      this._ws.addEventListener("open", () => {
        this._reconnectAttempts = 0;
        this.state.wsConnected = true;
        this._updateStatus("Connecté en temps réel");
        Telemetry.send("dashboard.ws.open");
      });
      this._ws.addEventListener("message", (evt) => this._onWsMessage(evt));
      this._ws.addEventListener("close", () => {
        this.state.wsConnected = false;
        this._updateStatus("Déconnecté du service temps réel");
        Telemetry.send("dashboard.ws.close");
        this._scheduleReconnect(url);
      });
      this._ws.addEventListener("error", (err) => {
        console.warn("WS error", err);
        this._ws.close();
      });
    } catch (err) {
      console.warn("WS connect failed", err);
      this._scheduleReconnect(url);
    }
  }

  _scheduleReconnect(url) {
    if (this._reconnectAttempts >= this.opts.maxReconnectAttempts) {
      this._updateStatus("Impossible de se reconnecter au service temps réel.");
      return;
    }
    this._reconnectAttempts += 1;
    const delay = this.opts.reconnectInterval * this._reconnectAttempts;
    setTimeout(() => this._connectWs(url), delay);
  }

  _closeWs() {
    if (!this._ws) return;
    try { this._ws.close(); } catch { /* ignore */ }
    this._ws = null;
    this.state.wsConnected = false;
  }

  _onWsMessage(evt) {
    try {
      const payload = JSON.parse(evt.data);
      if (payload.type === "course.updated") {
        const idx = this.state.courses.findIndex((c) => c.id === payload.data.id);
        if (idx !== -1) {
          this.state.courses[idx] = { ...this.state.courses[idx], ...payload.data };
          this._renderCourses();
        }
        Telemetry.send("dashboard.ws.course.updated", { id: payload.data.id });
      } else if (payload.type === "notification") {
        this._showToast(payload.data?.message || "Nouvelle notification");
      } else if (payload.type === "reload") {
        this._fetchCourses({ page: this.state.page });
      }
    } catch (err) {
      console.warn("Invalid WS message", err);
    }
  }

  /* -------------------------
     Interactions
     ------------------------- */
  _onCourseClick(e, course) {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;
    if (action === "open") {
      location.href = `/eleves/cours/${course.id}`;
    } else if (action === "materials") {
      this._openMaterials(course);
    }
  }

  _openMaterials(course) {
    import("/public/js/Dashboard_eleve/materials.js")
      .then((m) => m.openMaterialsModal(course))
      .catch((err) => {
        console.error("Failed to load materials module", err);
        this._showToast("Impossible d'ouvrir le matériel.");
      });
  }

  _goToPage(page) {
    this._fetchCourses({ page, pageSize: this.state.pageSize });
    Telemetry.send("dashboard.page.change", { page });
  }

  _onSearch(query) {
    this._fetchCourses({ page: 1, q: query });
    Telemetry.send("dashboard.search", { q: query });
  }

  _showToast(message, opts = {}) {
    const toast = el("div", { class: "toast", role: "status", "aria-live": "polite", text: message });
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add("visible"), 20);
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => toast.remove(), 300);
    }, opts.duration || 4500);
  }

  /* -------------------------
     Global listeners & shortcuts
     ------------------------- */
  _attachGlobalListeners() {
    window.addEventListener("resize", this._bound.onResize);
    window.addEventListener("keydown", this._bound.onKeyDown);
  }

  _detachGlobalListeners() {
    window.removeEventListener("resize", this._bound.onResize);
    window.removeEventListener("keydown", this._bound.onKeyDown);
    document.removeEventListener("visibilitychange", this._bound.onVisibility);
  }

  _onResize() {}

  _onKeyDown(e) {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      this.refs.search.focus();
      return;
    }
    if (e.key === "n") this._goToPage(Math.min(Math.ceil(this.state.total / this.state.pageSize), this.state.page + 1));
    if (e.key === "p") this._goToPage(Math.max(1, this.state.page - 1));
  }

  _onVisibilityChange() {
    if (document.visibilityState === "visible" && !this.state.wsConnected) {
      this._initRealtime();
    }
  }

  _registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        Telemetry.send("sw.register", { scope: reg.scope });
      })
      .catch((err) => {
        console.warn("SW registration failed", err);
      });
  }

  _debounce(fn, wait = 200) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), wait);
    };
  }
}

/* -------------------------
   Global DOM hook to initialize a lightweight websocket helper
   ------------------------- */
window.addEventListener("DOMContentLoaded", () => {
  // call the imported helper; it should be defensive if already initialized
  try {
    initWebSocket();
  } catch (err) {
    // non-fatal: log for diagnostics
    // eslint-disable-next-line no-console
    console.warn("initWebSocket failed:", err);
  }
});
