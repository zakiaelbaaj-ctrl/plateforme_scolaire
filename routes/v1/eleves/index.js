// routes/v1/eleves/index.js
// --------------------------------------------------
// Mount point for "eleves" feature routes (senior+++)
// - Uses relative imports only (no aliases here)
// - Defensive mounting with clear logging and safe error handling
// - Exports default function that mounts feature routes at the root of the provided router
// --------------------------------------------------

import elevesRoutes from "./elevesRoutes.js";
import logger from "../../../config/logger.js";

/**
 * Monte les routes "eleves" sur le router parent fourni.
 *
 * @param {import('express').Router} router - Router parent (ex: router v1)
 */
export default (router) => {
  if (!router || typeof router.use !== "function") {
    logger.error("eleves/index.js: parent router invalide lors du montage des routes eleves");
    throw new TypeError("parent router invalide pour le montage des routes eleves");
  }

  try {
    logger.info("Montage des routes eleves sur le router fourni (root mount)");
    // Monte les routes définies dans ./elevesRoutes.js à la racine du router fourni
    router.use("/", elevesRoutes);
    logger.info("Routes eleves montées avec succès sur '/' du router fourni");
  } catch (err) {
    const safeError = {
      name: err?.name || "Error",
      message: err?.message || "Erreur inconnue lors du montage des routes eleves",
    };
    logger.error("eleves/index.js: échec du montage des routes eleves", safeError);
    throw err;
  }
};
