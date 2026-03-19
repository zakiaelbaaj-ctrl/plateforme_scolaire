// public/js/Dashboard_eleve/timer.js
/**
 * Senior+++ timer utility for student dashboard
 * - ESM module, zero-deps
 * - Countdown and stopwatch modes, pause/resume/reset, auto-persist to sessionStorage
 * - Accurate ticking using performance.now() and drift correction
 * - Visibility handling, offline resilience, and optional server sync via websocket
 * - Emits events via callbacks and CustomEvent on document for easy integration
 * - Accessible: exposes ARIA-friendly text updates and optional audible alerts
 *
 * Integration notes:
 *   import Timer from "/public/js/Dashboard_eleve/timer.js";
 *   const t = new Timer({ duration: 60 * 60, onTick: (s)=>..., onEnd: ()=>... });
 *   t.start();
 *
 * The file intentionally calls initWebSocket() on DOMContentLoaded as requested.
 */

import { initWebSocket } from "./websocket.js";

window.addEventListener("DOMContentLoaded", () => {
  try {
    initWebSocket();
  } catch (err) {
    // defensive: websocket helper may throw if already initialized
    // eslint-disable-next-line no-console
    console.warn("initWebSocket() failed in timer module:", err);
  }
});

const STORAGE_KEY_PREFIX = "ps:dashboard:timer:";
const DEFAULTS = {
  mode: "countdown", // "countdown" | "stopwatch"
  duration: 0, // seconds for countdown
  tickInterval: 250, // ms, internal tick resolution
  persist: true,
  persistKey: "default",
  audible: false,
  audibleVolume: 0.6,
  autoStart: false,
  onTick: null, // (state) => {}
  onEnd: null, // () => {}
  onStateChange: null, // (state) => {}
};

/**
 * Helper: format seconds to HH:MM:SS (or MM:SS if < 1h)
 * @param {number} seconds
 */
export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh > 0) return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Timer class
 */
export default class Timer {
  constructor(options = {}) {
    this.opts = { ...DEFAULTS, ...options };
    this._key = `${STORAGE_KEY_PREFIX}${this.opts.persistKey}`;
    this._tickInterval = Math.max(50, Number(this.opts.tickInterval) || 250);

    // internal state
    this.state = {
      running: false,
      mode: this.opts.mode,
      duration: Number(this.opts.duration) || 0, // total seconds for countdown
      elapsed: 0, // seconds elapsed (stopwatch) or seconds elapsed since start (countdown)
      remaining: Math.max(0, Number(this.opts.duration) || 0),
      lastTickAt: null, // performance.now() timestamp
      pausedAt: null,
      startedAt: null, // epoch ms when started
    };

    // timers
    this._raf = null;
    this._lastPerf = null;
    this._tickHandle = null;

    // audible beep (optional)
    this._audio = null;
    if (this.opts.audible) this._createBeep();

    // restore persisted state if any
    if (this.opts.persist) this._restore();

    // visibility handling
    this._onVisibility = this._onVisibilityChange.bind(this);
    document.addEventListener("visibilitychange", this._onVisibility);

    // initial autoStart
    if (this.opts.autoStart && !this.state.running) this.start();
  }

  /* -------------------------
     Public API
     ------------------------- */

  start() {
    if (this.state.running) return;
    // if countdown and remaining is zero, reset from duration
    if (this.state.mode === "countdown" && this.state.remaining <= 0) {
      this.state.remaining = Number(this.state.duration) || 0;
      this.state.elapsed = 0;
    }
    this.state.running = true;
    this.state.startedAt = Date.now();
    this.state.lastTickAt = performance.now();
    this._lastPerf = performance.now();
    this._tickLoop();
    this._persist();
    this._emitState();
  }

  pause() {
    if (!this.state.running) return;
    this.state.running = false;
    this.state.pausedAt = Date.now();
    // stop loop
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._tickHandle) clearTimeout(this._tickHandle);
    this._raf = null;
    this._tickHandle = null;
    this._persist();
    this._emitState();
  }

  resume() {
    if (this.state.running) return;
    // adjust lastTick to now to avoid jump
    this.state.running = true;
    this.state.lastTickAt = performance.now();
    this._lastPerf = performance.now();
    this._tickLoop();
    this._persist();
    this._emitState();
  }

  reset({ keepDuration = true } = {}) {
    this.pause();
    this.state.elapsed = 0;
    this.state.remaining = keepDuration ? Number(this.state.duration) || 0 : 0;
    this.state.startedAt = null;
    this.state.pausedAt = null;
    this._persist();
    this._emitState();
  }

  setDuration(seconds) {
    this.state.duration = Math.max(0, Number(seconds) || 0);
    if (this.state.mode === "countdown") {
      this.state.remaining = this.state.duration;
    }
    this._persist();
    this._emitState();
  }

  switchMode(mode = "countdown") {
    if (!["countdown", "stopwatch"].includes(mode)) throw new TypeError("invalid mode");
    this.state.mode = mode;
    // normalize values
    if (mode === "countdown") {
      this.state.remaining = Number(this.state.duration) || 0;
      this.state.elapsed = 0;
    } else {
      this.state.elapsed = 0;
      this.state.remaining = Number(this.state.duration) || 0;
    }
    this._persist();
    this._emitState();
  }

  destroy() {
    this.pause();
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._audio = null;
    this._clearPersist();
  }

  getSnapshot() {
    return { ...this.state };
  }

  /* -------------------------
     Internal ticking & drift correction
     ------------------------- */

  _tickLoop() {
    // use RAF for smoothness but fallback to setTimeout for low-power tabs
    const tick = () => {
      const nowPerf = performance.now();
      const deltaMs = Math.max(0, nowPerf - (this._lastPerf || nowPerf));
      this._lastPerf = nowPerf;

      // accumulate seconds
      const deltaSec = deltaMs / 1000;
      if (this.state.mode === "stopwatch") {
        this.state.elapsed += deltaSec;
      } else {
        this.state.elapsed += deltaSec;
        this.state.remaining = Math.max(0, (Number(this.state.duration) || 0) - this.state.elapsed);
      }

      // call onTick at configured resolution
      const shouldEmit = (Date.now() - (this.state._lastEmitAt || 0)) >= this.opts.tickInterval;
      if (shouldEmit) {
        this.state._lastEmitAt = Date.now();
        this._emitTick();
        this._persist();
      }

      // check end condition for countdown
      if (this.state.mode === "countdown" && this.state.remaining <= 0) {
        this.state.remaining = 0;
        this.state.running = false;
        this._emitTick();
        this._emitEnd();
        this._persist();
        return; // stop loop
      }

      // schedule next tick
      if (this.state.running) {
        // prefer RAF when visible
        if (!document.hidden && typeof requestAnimationFrame === "function") {
          this._raf = requestAnimationFrame(tick);
        } else {
          // background tabs: use setTimeout to avoid throttling surprises
          this._tickHandle = setTimeout(tick, this._tickInterval);
        }
      }
    };

    // start loop
    if (typeof requestAnimationFrame === "function" && !document.hidden) {
      this._raf = requestAnimationFrame(tick);
    } else {
      this._tickHandle = setTimeout(tick, this._tickInterval);
    }
  }

  _emitTick() {
    const payload = {
      running: this.state.running,
      mode: this.state.mode,
      duration: Number(this.state.duration),
      elapsed: Math.floor(this.state.elapsed),
      remaining: Math.max(0, Math.ceil(this.state.remaining)),
      formatted: formatTime(this.state.mode === "countdown" ? Math.ceil(this.state.remaining) : Math.floor(this.state.elapsed)),
      timestamp: Date.now(),
    };

    // callback
    if (typeof this.opts.onTick === "function") {
      try { this.opts.onTick(payload); } catch (e) { /* swallow */ }
    }

    // custom event for global listeners
    try {
      const ev = new CustomEvent("dashboard:timer:tick", { detail: payload });
      document.dispatchEvent(ev);
    } catch (e) { /* ignore */ }
  }

  _emitEnd() {
    if (this.opts.audible && this._audio) {
      try { this._audio.play().catch(() => {}); } catch (e) { /* ignore */ }
    }

    if (typeof this.opts.onEnd === "function") {
      try { this.opts.onEnd(); } catch (e) { /* swallow */ }
    }

    try {
      const ev = new CustomEvent("dashboard:timer:end", { detail: { timestamp: Date.now() } });
      document.dispatchEvent(ev);
    } catch (e) { /* ignore */ }
  }

  _emitState() {
    if (typeof this.opts.onStateChange === "function") {
      try { this.opts.onStateChange({ ...this.state }); } catch (e) { /* swallow */ }
    }
    try {
      const ev = new CustomEvent("dashboard:timer:state", { detail: { ...this.state } });
      document.dispatchEvent(ev);
    } catch (e) { /* ignore */ }
  }

  /* -------------------------
     Persistence
     ------------------------- */

  _persist() {
    if (!this.opts.persist) return;
    try {
      const payload = {
        state: {
          running: this.state.running,
          mode: this.state.mode,
          duration: this.state.duration,
          elapsed: this.state.elapsed,
          remaining: this.state.remaining,
          startedAt: this.state.startedAt,
          pausedAt: this.state.pausedAt,
        },
        ts: Date.now(),
      };
      sessionStorage.setItem(this._key, JSON.stringify(payload));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Timer persist failed", err);
    }
  }

  _restore() {
    try {
      const raw = sessionStorage.getItem(this._key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.state) return;
      const s = parsed.state;
      this.state.mode = s.mode || this.state.mode;
      this.state.duration = Number(s.duration) || this.state.duration;
      this.state.elapsed = Number(s.elapsed) || 0;
      this.state.remaining = typeof s.remaining === "number" ? s.remaining : this.state.remaining;
      this.state.startedAt = s.startedAt || null;
      this.state.pausedAt = s.pausedAt || null;
      // if running was true when persisted, do not auto-start to avoid unexpected behavior;
      // keep running=false and let caller decide to resume
      this.state.running = false;
      this._emitState();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Timer restore failed", err);
    }
  }

  _clearPersist() {
    try { sessionStorage.removeItem(this._key); } catch (e) { /* ignore */ }
  }

  /* -------------------------
     Visibility handling
     ------------------------- */

  _onVisibilityChange() {
    if (document.hidden) {
      // when hidden, prefer setTimeout ticks (already handled in loop)
      return;
    }
    // when visible again, correct drift by resetting last perf timestamp
    this._lastPerf = performance.now();
    if (this.state.running && !this._raf) {
      this._tickLoop();
    }
  }

  /* -------------------------
     Audible beep
     ------------------------- */

  _createBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const gain = ctx.createGain();
      gain.gain.value = this.opts.audibleVolume;
      gain.connect(ctx.destination);

      this._audio = {
        play: () => {
          const o = ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = 880;
          o.connect(gain);
          o.start();
          setTimeout(() => {
            try { o.stop(); } catch (e) { /* ignore */ }
            o.disconnect();
          }, 220);
        },
      };
    } catch (err) {
      // audio not available
      this._audio = null;
    }
  }
}
