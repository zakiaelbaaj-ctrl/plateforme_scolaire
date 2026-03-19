// routes/coursRoutes.js
import express from "express";
import dotenv from "dotenv";
import pkg from "pg";
import jwt from "jsonwebtoken";

dotenv.config();
const { Pool } = pkg;
const router = express.Router();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// middleware pour vérifier le token JWT (à réutiliser)
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Token manquant" });
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer")
    return res.status(401).json({ message: "Format du token incorrect" });

  const token = parts[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // id, email, role...
    next();
  } catch (err) {
    return res.status(401).json({ message: "Token invalide" });
  }
}

/**
 * Routes :
 * - GET  /api/cours          -> lister tous les cours
 * - GET  /api/cours/:id      -> récupérer un cours
 * - POST /api/cours          -> créer un cours (protected: tuteur/professeur)
 * - PUT  /api/cours/:id      -> modifier un cours (protected)
 * - DELETE /api/cours/:id    -> supprimer un cours (protected)
 */

// LISTE TOUS LES COURS
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM cours ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// DETAILS D'UN COURS
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM cours WHERE id=$1", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Cours introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// CREER UN COURS (ex: seulement tuteur/professeur)
router.post("/", authMiddleware, async (req, res) => {
  const { titre, description, niveau } = req.body;
  // contrôle de rôle simple
  if (!["tuteur","professeur","admin_soutien"].includes(req.user.role))
    return res.status(403).json({ message: "Accès refusé" });

  if (!titre) return res.status(400).json({ message: "Titre requis" });

  try {
    const result = await pool.query(
      "INSERT INTO cours(titre, description, niveau) VALUES($1,$2,$3) RETURNING *",
      [titre, description || null, niveau || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// MODIFIER UN COURS
router.put("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { titre, description, niveau } = req.body;
  if (!["tuteur","professeur","admin_soutien"].includes(req.user.role))
    return res.status(403).json({ message: "Accès refusé" });

  try {
    const result = await pool.query(
      "UPDATE cours SET titre=$1, description=$2, niveau=$3 WHERE id=$4 RETURNING *",
      [titre, description, niveau, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ message: "Cours introuvable" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// SUPPRIMER UN COURS
router.delete("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!["tuteur","professeur","admin_soutien"].includes(req.user.role))
    return res.status(403).json({ message: "Accès refusé" });

  try {
    const result = await pool.query("DELETE FROM cours WHERE id=$1 RETURNING *", [id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Cours introuvable" });
    res.json({ message: "Cours supprimé", cours: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

export default router;
