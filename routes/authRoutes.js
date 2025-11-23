import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();
const { Pool } = pkg;
const router = express.Router();

// Connexion à PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: parseInt(process.env.DB_PORT, 10),
  ssl: { rejectUnauthorized: false }
});

// === Middleware JWT ===
const verifyToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Token manquant" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(403).json({ message: "Token invalide" });
  }
};

// ===== SIGNUP =====
router.post("/signup", async (req, res) => {
  const { username, password, prenom, nom, email, role, matiere } = req.body;

  try {
    if (!username || !password || !prenom || !nom || !email) {
      return res.status(400).json({ message: "Tous les champs sont requis" });
    }

    const userExist = await pool.query(
      "SELECT * FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );
    if (userExist.rows.length > 0) {
      return res.status(400).json({ message: "Utilisateur ou email déjà existant" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === "prof" ? "prof" : "eleve";
    const userStatus = role === "prof" ? "en_attente" : "valide";

    const result = await pool.query(
      `INSERT INTO users (username, password, email, prenom, nom, role, statut, matiere)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, prenom, nom, email, role, statut, matiere`,
      [username, hashedPassword, email, prenom, nom, userRole, userStatus, matiere || null]
    );

    res.status(201).json({
      message: "Compte créé avec succès",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("❌ Erreur signup:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ===== LOGIN =====
router.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    if (!username || !password) {
      return res.status(400).json({ message: "Username et password requis" });
    }

    const userQuery = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (userQuery.rows.length === 0) {
      return res.status(401).json({ message: "Utilisateur non trouvé" });
    }

    const user = userQuery.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    if (user.role === "prof" && user.statut !== "valide") {
      return res.status(403).json({ message: "Compte en attente de validation" });
    }

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
        email: user.email,
        role: user.role,
        statut: user.statut,
        matiere: user.matiere
      }
    });
  } catch (err) {
    console.error("❌ Erreur login:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ===== GET PROFILE =====
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const userQuery = await pool.query(
      "SELECT id, username, prenom, nom, email, role, statut, matiere FROM users WHERE id = $1",
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

// ===== UPDATE PROFILE =====
router.put("/profile", verifyToken, async (req, res) => {
  const { prenom, nom, matiere } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET prenom = COALESCE($1, prenom), 
           nom = COALESCE($2, nom),
           matiere = COALESCE($3, matiere)
       WHERE id = $4 
       RETURNING id, username, prenom, nom, email, role, matiere`,
      [prenom || null, nom || null, matiere || null, req.user.id]
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

// ===== LOGOUT =====
router.post("/logout", (req, res) => {
  res.json({ message: "Déconnecté avec succès" });
});

export default router;