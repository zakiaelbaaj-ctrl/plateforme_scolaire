// routes/users.routes.js

const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/auth");

router.get("/me", authMiddleware, async (req, res) => {
  try {

    const user = req.user;

    res.json({
      id: user.id,
      prenom: user.prenom,
      nom: user.nom,
      role: user.role,
      ville: user.ville,
      pays: user.pays
    });

  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;