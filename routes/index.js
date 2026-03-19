// routes/index.js
// --------------------------------------------------
// Application routes entry (senior+++)
// - Uses relative imports only (no aliases)
// - Exports EXACT shape requested: export default (app) => { app.use("/api", v1); }
// - Defensive mounting with clear logging and safe error handling
// - Keeps responsibilities minimal so server bootstrap controls global middleware
// --------------------------------------------------

import v1 from "./v1/index.js";
import logger from "../config/logger.js";

/**
 * Mount top-level routes on the provided Express app or router.
 *
 * Expected usage:
 *   import mountRoutes from "./routes/index.js";
 *   mountRoutes(app);
 *
 * This function intentionally mounts the v1 router at /api.
 *
 * @param {import('express').Application|import('express').Router} app
 */
export default (app) => {
  if (!app || typeof app.use !== "function") {
    logger.error("routes/index.js: app invalide lors du montage des routes");
    throw new TypeError("app invalide pour le montage des routes");
  }

  try {
    logger.info("Montage des routes principales: /api -> v1");
    app.use("/api", v1);
    logger.info("Routes montées: /api -> v1");
  } catch (err) {
    const safeError = {
      name: err?.name || "Error",
      message: err?.message || "Erreur inconnue lors du montage des routes",
    };
    logger.error("routes/index.js: échec du montage des routes", safeError);
    throw err;
  }
};
