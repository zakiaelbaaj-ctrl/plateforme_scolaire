// routes/authRoutes.js
import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;
const router = express.Router();

// Connexion à PostgreSQL
// Connexion à PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: parseInt(process.env.DB_PORT, 10), // convertir en nombre
  ssl: { rejectUnauthorized: false }       // SSL requis par Render
});


// === Middleware pour vérifier le JWT ===
const verifyToken = (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Token manquant" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ message: "Token invalide" });
  }
};

// 🔹 SIGNUP - Créer un compte
router.post("/signup", async (req, res) => {
  const { username, password, prenom, nom, role } = req.body;

  try {
    // Vérifier si l'utilisateur existe
    const userExist = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (userExist.rows.length > 0) {
      return res.status(400).json({ message: "Utilisateur déjà existant" });
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(password, 10);

    // Créer l'utilisateur
    const result = await pool.query(
      "INSERT INTO users (username, password, prenom, nom, role, statut) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, prenom, nom, role, statut",
      [username, hashedPassword, prenom || username, nom || username, role || 'eleve', role === 'prof' ? 'en_attente' : 'valide']
    );

    // Si c'est un prof, l'ajouter aussi à la table professeurs
    if (role === 'prof') {
      const email = `${username}@example.com`;
      try {
        await pool.query(
          "INSERT INTO professeurs (nom, prenom, email, matiere, statut) VALUES ($1, $2, $3, $4, $5)",
          [nom || username, prenom || username, email, 'Général', 'en_attente']
        );
        console.log(`✅ Prof "${username}" ajouté à la table professeurs`);
      } catch (err) {
        console.error("⚠️ Erreur ajout prof dans table professeurs:", err);
        // Continuer même si l'ajout à professeurs échoue
      }
    }

    res.status(201).json({
      message: "Compte créé avec succès",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("❌ Erreur signup:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 LOGIN - Connexion
router.post("/login", async (req, res) => {
  const { username, password, role } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({ message: "Username et password requis" });
    }

    // Rechercher l'utilisateur par username
    const userQuery = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }

    const user = userQuery.rows[0];

    // Vérifier le rôle
    if (user.role !== role) {
      return res.status(401).json({ message: "Rôle incorrect" });
    }

    // Vérifier le mot de passe
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    // Pour les profs, vérifier le statut (comparaison sans accent)
    if (user.role === 'prof' && user.statut !== 'valide') {
      return res.status(403).json({ 
        message: "Votre compte est en attente de validation par l'administrateur" 
      });
    }

    // Créer le JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      message: "Connexion réussie",
      token,
      user: {
        id: user.id,
        username: user.username,
        prenom: user.prenom,
        nom: user.nom,
        role: user.role,
        statut: user.statut
      }
    });
  } catch (err) {
    console.error("❌ Erreur login:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 GET PROFESSEURS (pour l'admin)
router.get("/professeurs", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM professeurs");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 UPDATE PROFESSEUR STATUT (pour l'admin)
router.put("/professeurs/:id", async (req, res) => {
  const { id } = req.params;
  const { statut } = req.body;

  try {
    // Mettre à jour dans professeurs
    await pool.query(
      "UPDATE professeurs SET statut = $1 WHERE id = $2",
      [statut, id]
    );

    // Récupérer le prof pour obtenir le username depuis users
    const profResult = await pool.query(
      "SELECT nom, prenom FROM professeurs WHERE id = $1",
      [id]
    );

    if (profResult.rows.length > 0) {
      const prof = profResult.rows[0];
      // Mettre à jour aussi dans users
      await pool.query(
        "UPDATE users SET statut = $1 WHERE nom = $2 AND prenom = $3",
        [statut === 'validé' ? 'valide' : statut, prof.nom, prof.prenom]
      );
    }

    res.json({ message: "Statut mis à jour avec succès" });
  } catch (err) {
    console.error("❌ Erreur update prof:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 GET PROFILE - Récupérer le profil
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const userQuery = await pool.query(
      "SELECT id, username, prenom, nom, role, statut FROM users WHERE id = $1",
      [req.user.id]
    );

    if (userQuery.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    res.json({ user: userQuery.rows[0] });
  } catch (err) {
    console.error("❌ Erreur profile:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 UPDATE PROFILE - Mettre à jour le profil
router.put("/profile", verifyToken, async (req, res) => {
  const { prenom, nom } = req.body;

  try {
    const result = await pool.query(
      "UPDATE users SET prenom = COALESCE($1, prenom), nom = COALESCE($2, nom) WHERE id = $3 RETURNING id, username, prenom, nom, role",
      [prenom || null, nom || null, req.user.id]
    );

    res.json({
      message: "Profil mis à jour",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("❌ Erreur update profile:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 LOGOUT
router.post("/logout", (req, res) => {
  res.json({ message: "Déconnecté avec succès" });
});

export default router;