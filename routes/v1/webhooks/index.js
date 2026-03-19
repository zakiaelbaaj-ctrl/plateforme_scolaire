// routes/v1/auth/index.js
// --------------------------------------------------
// Point d'entrée des routes d'authentification (sans alias)
// - Montage défensif et journalisation claire
// - Monte : auth.routes.js à '/' et password.routes.js à '/password'
// - Export EXACT demandé : export default (router) => { router.use("/", authRoutes); }
//   (ici on monte aussi passwordRoutes sous /password pour organisation)
// --------------------------------------------------

import authRoutes from "./auth.routes.js";
import passwordRoutes from "./password.routes.js";
import logger from "../../../config/logger.js";

/**
 * Monte les routes d'authentification sur le router fourni.
 *
 * @param {import('express').Router} router - Router parent (ex: router v1)
 */
export default (router) => {
  if (!router || typeof router.use !== "function") {
    logger.error("auth/index.js: parent router invalide lors du montage des routes d'auth");
    throw new TypeError("parent router invalide pour le montage des routes d'auth");
  }

  try {
    logger.info("Montage des routes d'auth sur le router fourni (root mount)");
    // Routes principales (register, login, logout, refresh, me, etc.)
    router.use("/", authRoutes);

    // Routes liées au mot de passe (forgot/reset) montées sous /password
    router.use("/password", passwordRoutes);

    logger.info("Routes d'auth montées avec succès sur le router fourni");
  } catch (err) {
    const safeError = {
      name: err?.name || "Error",
      message: err?.message || "Erreur inconnue lors du montage des routes d'auth",
    };
    logger.error("auth/index.js: échec du montage des routes d'auth", safeError);
    throw err;
  }
};
