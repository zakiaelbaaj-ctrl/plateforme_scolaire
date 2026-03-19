// --------------------------------------------------
// Auth Routes – Version professionnelle
// --------------------------------------------------

import express from "express";
import { body, validationResult } from "express-validator";

// Controllers
import { registerController } from "#controllers/registerController.js";
import { loginController } from "#controllers/loginController.js";
import { logoutController } from "#controllers/logoutController.js";
import { refreshTokenController } from "#controllers/refreshTokenController.js";
import { forgotPasswordController } from "#controllers/forgotPasswordController.js";
import { resetPasswordController } from "#controllers/resetPasswordController.js";
import { meController } from "#controllers/meController.js";

// Middlewares
import { requireAuth } from "#middlewares/requireAuth.js";
import authOptional from "#middlewares/authOptional.js";
import { onlineProfessors } from "../../../ws/state/onlineProfessors.js";
console.log("Chemin OK : onlineProfessors importé !");

const router = express.Router();

// --------------------------------------------------
// REGISTER
// --------------------------------------------------
router.post(
  "/register",
  [
    body("email").isEmail().withMessage("Email invalide"),
    body("password").isLength({ min: 6 }).withMessage("Mot de passe trop court (min 6 caractères)"),
    body("prenom").trim().notEmpty().withMessage("Prénom requis"),
    body("nom").trim().notEmpty().withMessage("Nom requis")
  ],
  registerController
);

// --------------------------------------------------
// LOGIN (email OU username)
// --------------------------------------------------
router.post(
  "/login",
  [
    body("username").optional().isString(),
    body("email").optional().isEmail(),
    body("password").exists().isString()
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    if (!req.body.email && !req.body.username) {
      return res.status(400).json({ success: false, message: "Email ou username requis" });
    }
    next();
  },
  loginController
);

// --------------------------------------------------
// LOGOUT
// --------------------------------------------------
router.post("/logout", logoutController);

// --------------------------------------------------
// REFRESH TOKEN
// --------------------------------------------------
router.post("/refresh", refreshTokenController);

// --------------------------------------------------
// FORGOT PASSWORD
// --------------------------------------------------
router.post(
  "/forgot-password",
  [body("email").isEmail().withMessage("Email invalide")],
  forgotPasswordController
);

// --------------------------------------------------
// RESET PASSWORD
// --------------------------------------------------
router.post(
  "/reset-password",
  [
    body("token").isString().withMessage("Token requis"),
    body("newPassword").isLength({ min: 8 }).withMessage("Mot de passe trop court (min 8 caractères)")
  ],
  resetPasswordController
);

// --------------------------------------------------
// GET CURRENT USER (PROTECTED / DEV-PROD SWITCH)
// --------------------------------------------------
// 🔹 Utilise authOptional pour DEV (injecte user fictif) ou token valide en PROD
router.get("/me", requireAuth, meController);

// --------------------------------------------------
// GET ONLINE PROFESSORS
// --------------------------------------------------
router.get("/online", (req, res) => {
  res.json({ success: true, profs: Array.from(onlineProfessors.values()) });
});

export default router;
