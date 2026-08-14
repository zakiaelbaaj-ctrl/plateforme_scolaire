import express from "express";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import { sequelize } from "../../../config/db.js";

const router = express.Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads/diplomes");

async function checkAccess(userId, role, filename) {
  if (role === "admin") return true;
  const relativePath = `/uploads/diplomes/${filename}`;
  const [owner] = await sequelize.query(
    `SELECT id FROM users 
     WHERE id = :userId 
     AND (diplome_url = :path OR piece_identite_url = :path OR photo_identite_url = :path 
          OR curriculum_vitae_url = :path OR lettre_motivation_url = :path)`,
    { replacements: { userId, path: relativePath }, type: sequelize.QueryTypes.SELECT }
  );
  return !!owner;
}

// Route publique dédiée aux photos de profil (uniquement photo_identite_url)
// Pas d'authentification requise — équivalent d'une photo de profil marketplace
router.get("/avatar/:filename", async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const relativePath = `/uploads/diplomes/${filename}`;

    const [match] = await sequelize.query(
      `SELECT id FROM users WHERE photo_identite_url = :path`,
      { replacements: { path: relativePath }, type: sequelize.QueryTypes.SELECT }
    );

    if (!match) {
      return res.status(404).json({ message: "Photo introuvable" });
    }

    const filePath = path.join(uploadDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Fichier introuvable" });
    res.sendFile(filePath);
  } catch (err) {
    console.error("Erreur accès avatar:", err.message);
    res.status(500).json({ message: "Erreur serveur" });
  }
});
// Génère un lien signé de 60s (pour <a>/<img>, qui ne peuvent pas envoyer de header)
router.get("/:filename/signed-url", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Token manquant" });
    }
    const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET);
    const filename = path.basename(req.params.filename);

    const hasAccess = await checkAccess(decoded.userId, decoded.role, filename);
    if (!hasAccess) return res.status(403).json({ message: "Accès refusé" });

    const token = jwt.sign({ filename, userId: decoded.userId }, process.env.JWT_SECRET, { expiresIn: "60s" });
    res.json({ url: `/api/v1/documents/${filename}?token=${token}` });
  } catch (err) {
    console.error("Erreur génération URL signée:", err.message);
    res.status(401).json({ message: "Token invalide" });
  }
});

// Sert réellement le fichier : header Authorization OU ?token= signé
router.get("/:filename", async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    let userId, role;

    if (req.query.token) {
      const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
      if (decoded.filename !== filename) {
        return res.status(403).json({ message: "Token ne correspond pas à ce fichier" });
      }
      userId = decoded.userId; // accès déjà validé lors de la génération du token
    } else if (req.headers.authorization?.startsWith("Bearer ")) {
      const decoded = jwt.verify(req.headers.authorization.split(" ")[1], process.env.JWT_SECRET);
      const hasAccess = await checkAccess(decoded.userId, decoded.role, filename);
      if (!hasAccess) return res.status(403).json({ message: "Accès refusé" });
    } else {
      return res.status(401).json({ message: "Authentification requise" });
    }

    const filePath = path.join(uploadDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: "Fichier introuvable" });
    res.sendFile(filePath);
  } catch (err) {
    console.error("Erreur accès document:", err.message);
    res.status(401).json({ message: "Token invalide ou expiré" });
  }
});

export default router;