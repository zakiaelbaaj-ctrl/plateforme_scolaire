// routes/v1/auth/password.routes.js
import express from "express";
import { body, validationResult } from "express-validator";

import {
  forgotPasswordController,
  resetPasswordController
} from "#controllers/auth.controller.js";

const router = express.Router();

/**
 * Small validation result handler to keep responses consistent
 */
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // For forgot-password we intentionally return a generic success message in some flows,
    // but here we keep validation errors explicit so callers know the payload is malformed.
    return res.status(400).json({ ok: false, errors: errors.array() });
  }
  next();
};

// ------------------------------
// POST /password/forgot
// ------------------------------
router.post(
  "/forgot",
  [
    body("email").isEmail().withMessage("Email invalide"),
    handleValidation
  ],
  forgotPasswordController
);

// ------------------------------
// POST /password/reset
// ------------------------------
router.post(
  "/reset",
  [
    body("token").isString().withMessage("Token requis"),
    body("newPassword").isLength({ min: 8 }).withMessage("Mot de passe trop court"),
    handleValidation
  ],
  resetPasswordController
);

export default router;
