// controllers/loginController.js

import { onlineProfessors, addProfessor } from "../ws/state/onlineProfessors.js";
import * as userService from "#services/usersService.js";
import bcrypt from "bcryptjs";
import { generateTokens } from "#services/token.service.js";
import { broadcastOnlineProfs, clients } from "../socket.js";

// ------------------------------
// LOGIN CONTROLLER
// ------------------------------
export async function loginController(req, res) {
  try {
    console.log("REQ.BODY =", req.body);
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Nom d'utilisateur et mot de passe sont requis"
      });
    }

    const user = await userService.findByUsernameWithPassword(username);
   // ✅ Place la vérification d'existence ICI avant les console.log
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Identifiants incorrects"
      });
    }
    console.log("USER FOUND =", user);
    console.log("DEBUG USER ROLE =", user.role);
    console.log("DEBUG USER EMAIL =", user.email);
    console.log("DEBUG USER ID =", user.id);


    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Identifiants incorrects"
      });
    }

    const isValid = await bcrypt.compare(password, user.password);
    console.log("PASSWORD VALID ?", isValid);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Identifiants incorrects"
      });
    }

    if (!user.statut || user.statut.toLowerCase().trim() !== "active") {
      return res.status(403).json({
        success: false,
        message: "Compte non actif. Veuillez contacter l'administrateur."
      });
    }

    // 🔹 Génération des tokens
    let tokens;
    try {
      tokens = await generateTokens({
        userId: user.id,
        email: user.email,
        role: user.role
      });
      console.log("TOKENS =", tokens);
    } catch (err) {
      console.error("Erreur génération tokens :", err);
      return res.status(500).json({
        success: false,
        message: "Impossible de générer les tokens"
      });
    }

    // 🔹 Si c'est un professeur → l'ajouter dans onlineProfessors
    if (user.role === "prof"|| user.role === "professeur") {
      const profData = {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        ville: user.ville,
        pays: user.pays,
        connectedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        ws: null
      };

      addProfessor(profData);
      console.log("PROF ONLINE =", profData);

      // 🔹 Diffuser aux élèves
      broadcastOnlineProfs(onlineProfessors, clients);
    }

    // 🔹 Nettoyage des données sensibles
    const { password: pwd, resetToken, resetTokenExpires, ...safeUser } = user;

    // 🔹 Normalisation du rôle pour le front
    safeUser.role = safeUser.role === "professeur" ? "prof" : safeUser.role;

    // 🔹 Réponse finale
    console.log("REPONSE FINALE =", { success: true, ...tokens }); // ← ic
    return res.status(200).json({
  success: true,
  user: {
    id: safeUser.id,
    prenom: safeUser.prenom,
    nom: safeUser.nom,
    role: safeUser.role,
    ville: safeUser.ville,
    pays: safeUser.pays,
  },
  ...tokens
});


  } catch (err) {
    console.error("Erreur loginController:", err);
    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}
