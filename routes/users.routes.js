import express from "express";
const router = express.Router();

// Imports des middlewares et contrôleurs
// Note: Vérifie bien que l'export dans auth.js est "export const authMiddleware"
import { authMiddleware } from "../middlewares/auth.js";
import * as userController from "../controllers/user.controller.js";

// --- ROUTES UTILISATEUR ---

// Récupérer son propre profil
// On utilise la fonction du contrôleur qui contient déjà la logique et le sanitizeUser
router.get("/me", authMiddleware, userController.meUser);

// --- ROUTES ADMIN ---

/**
 * Validation d'un professeur par l'admin
 * Cette route déclenche l'activation en BDD et la génération du lien Stripe Connect
 */
router.patch('/:id/validate-prof', authMiddleware, userController.validateAndOnboardProfessor);

// Lister les utilisateurs (utile pour l'admin pour trouver les profs à valider)
router.get("/", authMiddleware, userController.listUsers);

export default router;