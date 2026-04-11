// controllers/registerController.js
import logger from "#config/logger.js";
import * as usersService from "#services/usersService.js";

// Liste des rôles autorisés (On garde etudiant et eleve)
const ALLOWED_ROLES = ["etudiant", "eleve", "prof", "admin"];

export async function registerController(req, res) {
  try {
    const {
      username,
      prenom,
      nom,
      email,
      telephone,
      ville,
      pays,
      password,
      role,
      matiere,
      niveau

    } = req.body || {};

    // ------------------------------
    // 1. VALIDATION STRICTE
    // ------------------------------
    if (!email || !password || !prenom || !nom) {
      return res.status(400).json({
        success: false,
        message: "Champs obligatoires manquants (email, password, nom, prenom)"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Le mot de passe doit contenir au moins 6 caractères"
      });
    }

    // ------------------------------
    // 2. VÉRIFICATION DOUBLON
    // ------------------------------
    const existing = await usersService.findByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Un compte existe déjà avec cet email"
      });
    }

    // ------------------------------
    // 3. LOGIQUE RÔLE ET STATUT
    // ------------------------------
    let finalRole = role || "eleve"; // Défaut cohérent avec ta DB

    if (!ALLOWED_ROLES.includes(finalRole)) {
      finalRole = "eleve"; // Sécurité : on force 'eleve' si rôle inconnu
    }

    // Logique métier : 
    // - Les profs sont 'pending' (en attente de validation)
    // - Les élèves/étudiants sont 'active' immédiatement
    const finalStatus = (finalRole === "prof") ? "pending" : "active";

    // ------------------------------
    // 4. CRÉATION VIA LE SERVICE
    // ------------------------------
    const newUser = await usersService.createUser({
      username: username || null,
      prenom,
      nom,
      email,
      telephone: telephone || null,
      ville: ville || null,
      pays: pays || "France",
      password,
      role: finalRole,
      statut: finalStatus, // PASSAGE DU STATUT CRUCIAL
      matiere: matiere || null, // ✅ AJOUTÉ
      niveau: niveau || null
    });

    // ------------------------------
    // 5. RÉPONSE SÉCURISÉE
    // ------------------------------
    // On retire les données sensibles avant renvoi
    const { password: _, resetToken, resetTokenExpires, ...safeUser } = newUser;

    return res.status(201).json({
      success: true,
      message: finalStatus === "pending" 
        ? "Inscription réussie, votre compte est en attente de validation."
        : "Inscription réussie !",
      data: safeUser
    });

  } catch (err) {
    logger.error("registerController error", err);

    // Gestion propre des erreurs remontées par le service (ex: Contrainte Unique)
    if (err.message?.includes("déjà existant") || err.message?.includes("déjà pris")) {
      return res.status(409).json({
        success: false,
        message: err.message
      });
    }

    return res.status(500).json({
      success: false,
      message: "Erreur serveur lors de l'inscription"
    });
  }
}