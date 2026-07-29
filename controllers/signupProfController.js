// --------------------------------------------------
// Signup Professeur Controller
// --------------------------------------------------
import * as usersService from "#services/usersService.js";
import logger from "#config/logger.js";

export async function signupProfController(req, res) {
  try {
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
      matiere,
      accept_charte
    } = req.body;

    // 🔬 DIAGNOSTIC BRUT — à retirer après diagnostic
    console.log("=== DIAGNOSTIC ENCODAGE ===");
    console.log("matiere (brut):", matiere);
    console.log("matiere type:", typeof matiere, Array.isArray(matiere));
    if (typeof matiere === "string") {
      console.log("matiere char codes:", [...matiere].map(c => c.charCodeAt(0)));
    } else if (Array.isArray(matiere)) {
      matiere.forEach((m, i) => {
        console.log(`matiere[${i}] char codes:`, [...m].map(c => c.charCodeAt(0)));
      });
    }
    console.log("=== FIN DIAGNOSTIC ===");

    let niveaux = niveau;
    if (!Array.isArray(niveaux)) niveaux = [niveaux];
    let matieres = matiere;
   if (!Array.isArray(matieres)) matieres = [matieres];

    console.log("Matières (sans fix) :", matieres);

    if (!accept_charte) {
      return res.status(400).json({
        success: false,
        message: "Vous devez accepter la charte de sécurité pour vous inscrire."
      });
    }

    const diplomeFile       = req.files?.diplome?.[0];
    const pieceIdentiteFile = req.files?.piece_identite?.[0];
    const photoIdentiteFile = req.files?.photo_identite?.[0];
    const curriculumVitaeFile   = req.files?.curriculum_vitae?.[0];
    const lettreMotivationFile  = req.files?.lettre_motivation?.[0];

    if (!diplomeFile || !pieceIdentiteFile || !photoIdentiteFile || !curriculumVitaeFile || !lettreMotivationFile) {
      return res.status(400).json({
        success: false,
        message: "Tous les documents sont obligatoires."
      });
    }

    if (!email || !password || !username) {
      return res.status(400).json({
        success: false,
        message: "Champs obligatoires manquants (email, username ou mot de passe)."
      });
    }

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
      statut: "pending",
      niveau: niveaux,
      matiere: matieres,
      diplome_url: `/uploads/diplomes/${diplomeFile.filename}`,
      piece_identite_url: `/uploads/diplomes/${pieceIdentiteFile.filename}`,
      photo_identite_url: `/uploads/diplomes/${photoIdentiteFile.filename}`,
      curriculum_vitae_url: `/uploads/diplomes/${curriculumVitaeFile.filename}`,
      lettre_motivation_url: `/uploads/diplomes/${lettreMotivationFile.filename}`,
    });

    logger.info(`✨ Nouveau professeur inscrit (en attente) : ${email}`);

    return res.status(201).json({
      success: true,
      message: "Votre demande d'inscription a été envoyée avec succès. Elle sera validée par un administrateur sous 24h.",
      userId: newUser.id
    });

  } catch (err) {
    console.error("DEBUG FULL ERROR:", err);

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