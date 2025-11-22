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

// 🔹 SIGNUP
router.post("/signup", async (req, res) => {
  const { username, password, prenom, nom, role, telephone, matiere } = req.body;

  try {
    const userExist = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (userExist.rows.length > 0)
      return res.status(400).json({ message: "Utilisateur déjà existant" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, password, email, "prenom", "nom", role, statut, telephone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, "prenom", "nom", role, statut`,
      [
        username,
        hashedPassword,
        `${username}@example.com`,
        prenom || username,
        nom || username,
        role || "eleve",
        role === "prof" ? "en_attente" : "valide",
        telephone || null
      ]
    );

    // Ajout dans la table profs si rôle prof
    if (role === "prof") {
      const email = `${username}@example.com`;
      await pool.query(
        `INSERT INTO profs (nom, prenom, email, password, matiere, statut)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [nom || username, prenom || username, email, hashedPassword, matiere || "Général", "en_attente"]
      );
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

// 🔹 LOGIN
router.post("/login", async (req, res) => {
  const { username, password, role } = req.body;

  try {
    const userQuery = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (userQuery.rows.length === 0)
      return res.status(401).json({ message: "Utilisateur non trouvé" });

    const user = userQuery.rows[0];
    if (user.role !== role)
      return res.status(401).json({ message: "Rôle incorrect" });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword)
      return res.status(401).json({ message: "Mot de passe incorrect" });

    if (user.role === "prof" && user.statut !== "valide")
      return res.status(403).json({ message: "Compte en attente de validation" });

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

// 🔹 GET PROFESSEURS (sans téléphone)
router.get("/professeurs", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, prenom, nom, email, username, matiere, statut
      FROM profs
      ORDER BY id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur récupération professeurs:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 GET PROFESSEURS AVEC HEURES
router.get("/professeurs/avec_heures", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.id, p.prenom, p.nom, p.email, p.username, p.matiere, p.statut,
             COALESCE(SUM(a.duree_minutes), 0) as heures_en_ligne
      FROM profs p
      LEFT JOIN appels a ON p.username = a.prof_username
      GROUP BY p.id, p.prenom, p.nom, p.email, p.username, p.matiere, p.statut
      ORDER BY p.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur récupération professeurs avec heures:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 GET PROFESSEURS PAR MATIERE
router.get("/professeurs/matiere/:matiere", async (req, res) => {
  const { matiere } = req.params;

  try {
    const result = await pool.query(`
      SELECT id, prenom, nom, email, username, matiere, statut
      FROM profs
      WHERE LOWER(matiere) LIKE LOWER($1)
      AND statut = 'valide'
      ORDER BY nom
    `, [`%${matiere}%`]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        message: "Aucun professeur disponible pour cette matière" 
      });
    }

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur récupération professeurs par matière:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 GET TOUTES LES MATIERES DISPONIBLES
router.get("/matieres", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT matiere
      FROM profs
      WHERE matiere IS NOT NULL
      AND statut = 'valide'
      ORDER BY matiere
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur récupération matières:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 UPDATE STATUT PROFESSEUR
router.put("/professeurs/:id", async (req, res) => {
  const { id } = req.params;
  const { statut } = req.body;

  try {
    await pool.query("UPDATE profs SET statut = $1 WHERE id = $2", [statut, id]);

    const profResult = await pool.query("SELECT email FROM profs WHERE id = $1", [id]);
    if (profResult.rows.length > 0) {
      const email = profResult.rows[0].email;
      const newStatut = statut === "validé" || statut === "valide" ? "valide" : statut;
      await pool.query("UPDATE users SET statut = $1 WHERE email = $2", [newStatut, email]);
    }

    res.json({ message: "Statut mis à jour avec succès" });
  } catch (err) {
    console.error("❌ Erreur update prof:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 UPDATE MATIERE D'UN PROFESSEUR
router.put("/professeurs/:id/matiere", async (req, res) => {
  const { id } = req.params;
  const { matiere } = req.body;

  try {
    const result = await pool.query(
      "UPDATE profs SET matiere = $1 WHERE id = $2 RETURNING id, nom, prenom, matiere",
      [matiere, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Professeur non trouvé" });
    }

    res.json({ 
      message: "Matière mise à jour avec succès",
      prof: result.rows[0] 
    });
  } catch (err) {
    console.error("❌ Erreur update matière:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 DELETE PROFESSEUR
router.delete("/professeurs/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const profResult = await pool.query("SELECT email FROM profs WHERE id = $1", [id]);
    if (profResult.rows.length === 0) {
      return res.status(404).json({ message: "Professeur non trouvé" });
    }

    const email = profResult.rows[0].email;

    // Supprimer de profs
    await pool.query("DELETE FROM profs WHERE id = $1", [id]);

    // Supprimer de users
    await pool.query("DELETE FROM users WHERE email = $1", [email]);

    res.json({ message: "Professeur supprimé avec succès" });
  } catch (err) {
    console.error("❌ Erreur suppression prof:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 GET PROFILE
router.get("/profile", verifyToken, async (req, res) => {
  try {
    const userQuery = await pool.query(
      "SELECT id, username, \"prenom\", nom, role, statut FROM users WHERE id = $1",
      [req.user.id]
    );
    if (userQuery.rows.length === 0)
      return res.status(404).json({ message: "Utilisateur non trouvé" });

    res.json({ user: userQuery.rows[0] });
  } catch (err) {
    console.error("❌ Erreur profile:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// 🔹 UPDATE PROFILE
router.put("/profile", verifyToken, async (req, res) => {
  const { prenom, nom } = req.body;

  try {
    const result = await pool.query(
      `UPDATE users 
       SET "prenom" = COALESCE($1, "prenom"), 
           nom = COALESCE($2, nom)
       WHERE id = $3 
       RETURNING id, username, "prenom", nom, role`,
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