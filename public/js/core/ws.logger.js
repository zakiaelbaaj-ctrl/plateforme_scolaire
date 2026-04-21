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
    if (shouldLog("debug")) console.log("ðŸŸ¦ WS DEBUG:", ...args);
  },

  info(...args) {
    if (shouldLog("info")) console.log("ðŸŸ© WS INFO:", ...args);
  },

  warn(...args) {
    if (shouldLog("warn")) console.warn("ðŸŸ¨ WS WARN:", ...args);
  },

  error(...args) {
    console.error("ðŸŸ¥ WS ERROR:", ...args);
  },

  raw(data) {
    // logs payload brut seulement en dev
    if (!isProd) {
      console.log("ðŸ“© WS RAW:", data);
    }
  },

  isProd
};

