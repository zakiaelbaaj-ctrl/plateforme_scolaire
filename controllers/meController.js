// controllers/meController.js
import * as userService from "#services/usersService.js";
import logger from "#config/logger.js";

export async function meController(req, res) {
  try {
    // 🔹 Mode DEV → JWT désactivé → mock utilisateur
    if (process.env.DISABLE_JWT === "true") {
      return res.status(200).json({
        success: true,
        user: {
          id: 1,
          nom: "Zak",
          prenom: "Zakia",
          email: "zakia@example.com",
          ville: "Paris",
          pays: "France",
          matiere: "Mathématiques",
          niveau: "Lycée",
          role: "professeur"
        }
      });
    }

    // 🔹 Mode PROD → récupération depuis la base
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Utilisateur non authentifié"
      });
    }

    const user = await userService.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Utilisateur introuvable"
      });
    }

    // On retire les infos sensibles
    const { password, resetToken, resetTokenExpires, ...safeUser } = user;

    return res.status(200).json({
      success: true,
      user: safeUser
    });

  } catch (err) {
    logger.error("Erreur dans meController", {
      message: err.message,
      stack: err.stack
    });

    return res.status(500).json({
      success: false,
      message: "Erreur serveur"
    });
  }
}
