// --------------------------------------------------
// Signup Professeur Controller
// --------------------------------------------------
import * as usersService from "#services/usersService.js";
import logger from "#config/logger.js";

/**
 * Gère l'inscription d'un nouveau professeur avec son diplôme
 */
export async function signupProfController(req, res) {
  try {
    // 1. Récupération des données textuelles depuis le FormData
    const { 
      prenom, 
      nom, 
      email, 
      password, 
      username, 
      telephone, 
      pays, 
      ville, 
      niveau, 
      matiere 
    } = req.body;

    // 2. Récupération du fichier via Multer (req.file)
    const diplomeFile = req.file;

    // Validation minimale
    if (!diplomeFile) {
      return res.status(400).json({ 
        success: false, 
        message: "Le téléchargement du diplôme est obligatoire pour les professeurs." 
      });
    }

    if (!email || !password || !username) {
      return res.status(400).json({ 
        success: false, 
        message: "Champs obligatoires manquants (email, username ou mot de passe)." 
      });
    }

    // 3. Appel au service pour créer l'utilisateur
    // On force le rôle "professeur" et le statut "pending"
    const newUser = await usersService.createUser({
      username,
      prenom,
      nom,
      email,
      telephone,
      ville,
      pays,
      password,
      role: "prof",
      statut: "pending", // L'admin devra valider ce compte
      diplome_url: diplomeFile.path // On stocke le chemin local du fichier
    });

    logger.info(`✨ Nouveau professeur inscrit (en attente) : ${email}`);

    // 4. Réponse au frontend
    return res.status(201).json({
      success: true,
      message: "Votre demande d'inscription a été envoyée avec succès. Elle sera validée par un administrateur sous 24h.",
      userId: newUser.id
    });

  } catch (err) {
    console.error("DEBUG FULL ERROR:", err);

    // Gestion des erreurs de doublons (Email / Username)
    if (err.message.includes("Email déjà existant") || err.message.includes("Nom d'utilisateur déjà pris")) {
      return res.status(400).json({ 
        success: false, 
        message: err.message 
      });
    }

    return res.status(500).json({ 
      success: false, 
      message: "Une erreur interne est survenue lors de l'inscription." 
    });
  }
}
