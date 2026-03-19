// start.js
// Petit wrapper ESM pour loader dotenv avant tout

import dotenv from "dotenv";

// Charger .env dès le départ
dotenv.config({ path: ".env" });

// Shim temporaire pour logger pendant le bootstrap (optionnel)
global.logger = {
  info: (...args) => {},
  debug: (...args) => {},
  warn: (...args) => {},
  error: (...args) => {},
};

(async () => {
  try {
    await import("./server.js");
  } catch (err) {
    console.error("Failed to import server.js:", err);
    process.exit(1);
  }
})();
