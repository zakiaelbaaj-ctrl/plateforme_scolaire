// controllers/index.js
// Central export for controllers - facilite les imports dans routes et tests
// Conventions : chaque fichier de controllers exporte des fonctions nommées (async (req,res))
// Ce fichier ré-exporte ces modules pour un import unique dans les routers.
//
// Exemple d'utilisation :
// import { authController, elevesController } from "#controllers";
// app.use("/auth", authControllerRouter); // ou destructurer les handlers

import * as authController from "./auth.controller.js";
import * as elevesController from "./eleves.controller.js";
import * as appelController from "./appel.controller.js";
import * as profController from "./prof.controller.js";
import * as paymentController from "./payment.controller.js";
import * as webhookController from "./webhook.controller.js";
import * as userController from "./user.controller.js";

// Export nommé pour accès granulaire
export {
  authController,
  elevesController,
  appelController,
  profController,
  paymentController,
  webhookController,
  userController,
};

// Export par défaut (objet plat) pour compatibilité
export default {
  authController,
  elevesController,
  appelController,
  profController,
  paymentController,
  webhookController,
  userController,
};
