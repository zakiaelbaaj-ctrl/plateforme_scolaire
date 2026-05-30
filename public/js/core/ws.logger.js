import { AppState } from "./state.js";

const isProd =
  (window.location.hostname !== "localhost" &&
   window.location.hostname !== "127.0.0.1");

const LOG_LEVEL = isProd ? "error" : "debug";

function shouldLog(level) {
  const levels = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };
  return levels[level] >= levels[LOG_LEVEL];
}

export const WSLogger = {
  debug(...args) {
    if (shouldLog("debug")) console.log("🔧 WS DEBUG:", ...args);
  },

  info(...args) {
    if (shouldLog("info")) console.log("📡 WS INFO:", ...args);
  },

  // 🌟 LE CODE EST MODIFIÉ ICI
  warn(...args) {
    if (!shouldLog("warn")) return;

    // Liste noire des types d'événements à ignorer silencieusement
    const ignoredTypes = ['userLeftRoom', 'tableauClear'];

    // args[0] est "Type non géré:", args[1] est le nom de l'événement (ex: 'userLeftRoom')
    const eventType = args[1]; 

    // Si le type d'événement est dans notre liste noire, on sort sans rien afficher
    if (ignoredTypes.includes(eventType)) {
      return;
    }

    console.warn("⚠️ WS WARN:", ...args);
  },

  error(...args) {
    console.error("❌ WS ERROR:", ...args);
  },

  raw(data) {
    if (!isProd) {
      console.log("📦 WS RAW:", data);
    }
  },

  isProd
};