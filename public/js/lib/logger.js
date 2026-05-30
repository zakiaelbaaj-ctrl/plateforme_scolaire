// ======================================================
// LOGGER CENTRALISE (UI + CONSOLE)
// ======================================================

const MAX_LOG_LINES = 200;

let logContainer = null;
let initialized  = false;

function init(options = {}) {
  if (initialized) return;

  const {
    enabledUI = true,
    position  = "bottom", // "bottom" | "top"
  } = options;

  if (enabledUI) {
    logContainer = document.createElement("div");

    Object.assign(logContainer.style, {
      position:   "fixed",
      left:       "0",
      right:      "0",
      height:     "150px",
      overflow:   "auto",
      background: "rgba(0,0,0,0.85)",
      color:      "#00ff88",
      fontSize:   "11px",
      zIndex:     "9999",
      padding:    "5px",
      fontFamily: "monospace",
      ...(position === "top" ? { top: "0" } : { bottom: "0" }),
    });

    document.body.appendChild(logContainer);
  }

  initialized = true;
}

// ======================================================
// HELPERS
// ======================================================

function serialize(arg) {
  if (arg === null || arg === undefined) return String(arg);

  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg);
    } catch {
      return "[object]";
    }
  }

  return String(arg);
}

function format(level, args) {
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  return `[${time}] [${level.toUpperCase()}] ${args.map(serialize).join(" ")}`;
}

function appendToUI(message) {
  if (!logContainer) return;

  const line = document.createElement("div");
  line.textContent = message;

  logContainer.appendChild(line);

  // Limiter la taille pour éviter memory leak
  while (logContainer.childNodes.length > MAX_LOG_LINES) {
    logContainer.removeChild(logContainer.firstChild);
  }

  logContainer.scrollTop = logContainer.scrollHeight;
}

// ======================================================
// METHODES PUBLIQUES
// ======================================================

function log(...args) {
  const msg = format("log", args);
  console.log(...args);
  appendToUI(msg);
}

function warn(...args) {
  const msg = format("warn", args);
  console.warn(...args);
  appendToUI(msg);
}

function error(...args) {
  const msg = format("error", args);
  console.error(...args);
  appendToUI(msg);
}

// ======================================================
// EXPORT
// ======================================================

export const Logger = {
  init,
  log,
  warn,
  error,
};
