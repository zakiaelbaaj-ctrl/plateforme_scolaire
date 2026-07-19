// --------------------------------------------------
// Auth Routes – Version professionnelle
// --------------------------------------------------

import express from "express";
import { body, validationResult } from "express-validator";
import { 
  registerController, 
  loginController, 
  logoutController, 
  refreshTokenController, 
  meController, 
  forgotPasswordController,
  resetPasswordController 
} from "#controllers/auth.controller.js";
// Middlewares
import { requireAuth } from "#middlewares/requireAuth.js";
import authOptional from "#middlewares/authOptional.js";
import { onlineProfessors } from "../../../ws/state/onlineProfessors.js";
import logger from "#config/logger.js";
console.log("Chemin OK : onlineProfessors importé !");

const router = express.Router();

// --------------------------------------------------
// REGISTER
// --------------------------------------------------
router.post("/register", (req, res) => {
  logger.warn("⚠️ Route /register appelée — considérée comme morte, à investiguer avant réactivation ou suppression", {
    ip: req.ip,
    userAgent: req.get("user-agent"),
    body: req.body
  });
  return res.status(410).json({
    success: false,
    message: "Cette route n'est plus disponible. Utilisez /signup-eleve ou /signup-prof."
  });
});
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
