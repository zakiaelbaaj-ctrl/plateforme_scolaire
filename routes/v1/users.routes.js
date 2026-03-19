const express = require("express");
const router = express.Router();

// Middleware auth (doit déjà exister dans ton projet)
const authMiddleware = require("../../middlewares/auth.middleware");

// ======================================================
// GET /v1/users/me
// Retourne l'utilisateur connecté
// ======================================================
router.get("/me", authMiddleware, async (req, res) => {

  try {

    // req.user doit être injecté par le middleware auth
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Utilisateur non authentifié" });
    }

    res.json({
      id: user.id,
      prenom: user.prenom,
      nom: user.nom,
      role: user.role,
      ville: user.ville,
      pays: user.pays,
      email: user.email
    });

  } catch (err) {

    console.error("Erreur /users/me :", err);
    res.status(500).json({ error: "Erreur serveur" });

  }

});

module.exports = router;