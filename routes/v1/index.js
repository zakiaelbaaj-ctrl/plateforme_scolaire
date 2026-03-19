// routes/v1/index.js
// --------------------------------------------------
// Mount point for API v1 feature routers (senior+++)
// - Validates parent router
// - Defensive mounting of feature routers with logging
// - Exposes lightweight health/readiness endpoints
// --------------------------------------------------

import auth from "./auth/index.js";
import webhooks from "./webhooks/index.js";
import eleves from "./eleves/index.js";
import twilioRoutes from "./twilio/twilio.routes.js";   // <-- AJOUT ICI
import logger from "../../config/logger.js";

export default function mountV1(router, { logger: optLogger } = {}) {
  const log = optLogger || logger || console;

  if (!router || typeof router.use !== "function") {
    log.error("routes/v1/index.js: parent router invalide lors du montage des routes v1");
    throw new TypeError("parent router invalide pour le montage des routes v1");
  }

  try {
    log.info("Montage des routes v1: démarrage");

    // --------------------------------------------------
    // Déclaration des modules à monter
    // --------------------------------------------------
    const mounts = [
      { path: "/auth", r: auth },
      { path: "/webhooks", r: webhooks },
      { path: "/eleves", r: eleves },
      { path: "/twilio", r: twilioRoutes }   // <-- AJOUT ICI
    ];

    // --------------------------------------------------
    // Montage dynamique des modules
    // --------------------------------------------------
    for (const { path, r } of mounts) {
      if (!r) {
        log.warn(`Skipping ${path}: module export is falsy`);
        continue;
      }

      if (typeof r.use !== "function" && typeof r === "function") {
        // Some routers are exported as a function that returns a router
        try {
          const resolved = r();
          if (resolved && typeof resolved.use === "function") {
            router.use(path, resolved);
            log.info(`Mounted ${path} (resolved factory)`);
            continue;
          }
        } catch (err) {
          log.warn(`Could not resolve router factory for ${path}: ${err?.message || err}`);
          continue;
        }
      }

      if (typeof r.use === "function") {
        router.use(path, r);
        log.info(`Mounted ${path}`);
      } else {
        log.warn(`Skipping ${path}: router does not expose .use()`);
      }
    }

    // --------------------------------------------------
    // Endpoints de santé
    // --------------------------------------------------
    router.get("/_health", (req, res) => {
      res.status(200).json({
        ok: true,
        env: process.env.NODE_ENV || "development",
        version: "v1"
      });
    });

    router.get("/_ready", (req, res) => {
      res.status(200).json({ ok: true, ready: true });
    });

    log.info("Montage des routes v1: terminé");
  } catch (err) {
    const safeError = {
      name: err?.name || "Error",
      message: err?.message || "Erreur inconnue lors du montage des routes v1"
    };

    try {
      (optLogger || logger || console).error(
        "routes/v1/index.js: échec du montage des routes v1",
        safeError
      );
    } catch {
      console.error(
        "routes/v1/index.js: échec du montage des routes v1",
        safeError
      );
    }

    throw err;
  }
}
