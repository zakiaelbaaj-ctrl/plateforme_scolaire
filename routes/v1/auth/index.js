// routes/v1/auth/index.js
import authRoutes from "./auth.routes.js";
import passwordRoutes from "./password.routes.js";
import logger from "#config/logger.js";

/**
 * Mount auth feature routes on the provided parent router.
 *
 * Expected to be called like:
 *   import mountAuth from "#routes/v1/auth/index.js";
 *   mountAuth(routerForAuth);
 *
 * This module mounts:
 *   - authRoutes at '/'
 *   - passwordRoutes at '/password'
 */
export default (router) => {
  if (!router || typeof router.use !== "function") {
    logger.error("auth/index.js: parent router invalide lors du montage des routes d'auth");
    throw new TypeError("parent router invalide pour le montage des routes d'auth");
  }

  try {
    logger.info("Montage des routes d'auth sur le router fourni");
    // Mount main auth routes (register, login, logout, refresh, me, etc.)
    router.use("/", authRoutes);

    // Mount password-specific routes under /password
    router.use("/password", passwordRoutes);

    logger.info("Routes d'auth montées avec succès");
  } catch (err) {
    const safeError = {
      name: err?.name || "Error",
      message: err?.message || "Erreur inconnue lors du montage des routes d'auth",
    };
    logger.error("auth/index.js: échec du montage des routes d'auth", safeError);
    throw err;
  }
};
