// controllers/loginController.js

import { onlineProfessors, addProfessor } from "../ws/state/onlineProfessors.js";
import * as userService from "#services/usersService.js";
import bcrypt from "bcryptjs";
import { generateTokens } from "#services/token.service.js";
// ✅ Importation depuis ton fichier socket.js (Map des clients et fonction de diffusion)
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

    // 1. Recherche de l'utilisateur
    const user = await userService.findByUsernameWithPassword(username);
    console.log("FIND USER RESULT =", user);
    console.log("FIND USER ERROR TYPE =", typeof user);
    // 🛡️ Sécurité : Vérification d'existence avant de logger quoi que ce soit
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Identifiants incorrects"
      });
    }

    // Logs de debug (identiques à tes précédents)
    console.log("USER FOUND =", user);
    console.log("DEBUG USER ROLE =", user.role);
    console.log("DEBUG USER EMAIL =", user.email);
    console.log("DEBUG USER ID =", user.id);

    // 2. Vérification du mot de passe
    const isValid = await bcrypt.compare(password, user.password);
    console.log("PASSWORD VALID ?", isValid);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Identifiants incorrects"
      });
    }

    // 🛡️ SÉCURITÉ STATUT : Uniquement pour les professeurs (role 'prof' ou 'professeur')
    // Les élèves peuvent se connecter peu importe leur statut
    if (user.role === "prof" || user.role === "professeur") {
      if (!user.statut || user.statut.toLowerCase().trim() !== "active") {
        return res.status(403).json({
          success: false,
          message: "Compte non actif. Veuillez contacter l'administrateur."
        });
      }
    }

    // 3. Génération des tokens
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

    // 4. Si c'est un professeur → l'ajouter dans l'état global onlineProfessors
    if (user.role === "prof" || user.role === "professeur") {
      const profData = {
        id: user.id,
        prenom: user.prenom,
        nom: user.nom,
        ville: user.ville || "",
        pays: user.pays || "",
        connectedAt: new Date().toISOString(),
        lastActiveAt: new Date().toISOString(),
        ws: null // Sera assigné lors de la connexion WebSocket
      };

      addProfessor(profData);
      console.log("PROF ONLINE =", profData);

      // 🔹 Diffusion en temps réel aux élèves connectés (via WebSocket)
      if (broadcastOnlineProfs) {
        broadcastOnlineProfs(onlineProfessors, clients);
      }
    }

    // 5. Nettoyage des données sensibles
    const { password: pwd, resetToken, resetTokenExpires, ...safeUser } = user;

    // 🔹 Normalisation du rôle pour le frontend
    const finalRole = (user.role === "professeur" || user.role === "prof") ? "prof" : user.role;

    // 6. Réponse finale au client
    console.log("REPONSE FINALE =", { success: true, ...tokens });
    
    return res.status(200).json({
      success: true,
      user: {
        id: safeUser.id,
        prenom: safeUser.prenom,
        nom: safeUser.nom,
        role: finalRole,
        ville: safeUser.ville || "",
        pays: safeUser.pays || "",
      },
      ...tokens
    });

  } catch (err) {
  console.error("TYPE:", typeof err);
  console.error("CONSTRUCTOR:", err?.constructor?.name);
  console.error("JSON:", JSON.stringify(err));
  console.error("MESSAGE:", err?.message);
  console.error("STACK:", err?.stack);
  console.error("RAW:", err);

  return res.status(500).json({
    success: false,
    message: err?.message || JSON.stringify(err) || "Erreur serveur"
  });
}
}