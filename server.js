// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";
import pkg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import nodemailer from "nodemailer";

import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";

dotenv.config();
const { Pool } = pkg;

// --- Express setup ---
const app = express();
app.use(express.json());
app.get('/favicon.ico', (req, res) => res.status(204).send());

// --- Define __dirname for ES modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- PostgreSQL connection ---
console.log("🔍 Variables d'environnement :");
console.log("   DB_HOST:", process.env.DB_HOST);
console.log("   DB_USER:", process.env.DB_USER);
console.log("   DB_NAME:", process.env.DB_NAME);
console.log("   DB_PORT:", process.env.DB_PORT);
console.log("   DB_PASS:", process.env.DB_PASS ? "***" : "NON DÉFINI");
console.log("   EMAIL_USER:", process.env.EMAIL_USER ? "✅" : "❌ DÉSACTIVÉ");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  ssl: { rejectUnauthorized: false },
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  max: 20
});

pool.connect()
  .then(() => console.log("✅ Connecté à PostgreSQL"))
  .catch(err => console.error("❌ Erreur PostgreSQL :", err));

// --- Email Configuration (OPTIONNEL - Ne pas bloquer le serveur) ---
let transporter = null;
let emailEnabled = false;

function initializeEmailService() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("ℹ️  Service email DÉSACTIVÉ (EMAIL_USER/PASS non défini)");
    return;
  }

  try {
    // Configuration avec timeout court et sans vérification
    transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      connectionTimeout: 5000,
      socketTimeout: 5000
    });

    // Ne pas vérifier avec verify() car cela cause le timeout
    // À la place, on test que lors du premier envoi
    emailEnabled = true;
    console.log("✅ Service email configuré (mode optimisé)");
  } catch (error) {
    console.log("⚠️  Erreur config email:", error.message);
    console.log("💡 Le service email est désactivé - Les fonctionnalités principales restent actives");
    transporter = null;
    emailEnabled = false;
  }
}

initializeEmailService();

// --- API routes ---
app.use("/api/auth", authRoutes);
app.use("/api", adminRoutes);

app.get("/api", (req, res) => {
  res.json({ message: "Bienvenue sur l'API soutien scolaire 📚" });
});

// --- ROUTE LOGIN ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username et password requis" });
    }

    const result = await pool.query(
      "SELECT id, username, password, prenom, nom, statut, role, email, matiere FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Utilisateur introuvable" });
    }

    const user = result.rows[0];

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    res.json({
      user: {
        id: user.id,
        username: user.username,
        prenom: user.prenom,
        nom: user.nom,
        statut: user.statut,
        role: user.role,
        email: user.email,
        matiere: user.matiere
      }
    });
  } catch (err) {
    console.error("Erreur login:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// --- ROUTE HEURES ---
app.get("/api/prof/:username/heures", async (req, res) => {
  try {
    const { username } = req.params;

    const result = await pool.query(
      "SELECT lundi, mardi, mercredi, jeudi, vendredi FROM heures_prof WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.json({
        heures: {
          lundi: 0,
          mardi: 0,
          mercredi: 0,
          jeudi: 0,
          vendredi: 0,
          total: 0
        }
      });
    }

    const h = result.rows[0];
    const total = h.lundi + h.mardi + h.mercredi + h.jeudi + h.vendredi;

    res.json({
      heures: {
        lundi: h.lundi,
        mardi: h.mardi,
        mercredi: h.mercredi,
        jeudi: h.jeudi,
        vendredi: h.vendredi,
        total: total
      }
    });
  } catch (err) {
    console.error("Erreur heures:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// --- ROUTE INSCRIPTION ---
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password, prenom, nom, email, role, matiere } = req.body;

    if (!username || !password || !prenom || !nom || !email) {
      return res.status(400).json({ message: "Tous les champs sont requis" });
    }

    const check = await pool.query(
      "SELECT id FROM users WHERE username = $1 OR email = $2",
      [username, email]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ message: "Username ou email déjà utilisé" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === "prof" ? "prof" : "eleve";

    const result = await pool.query(
      "INSERT INTO users (username, password, prenom, nom, email, role, statut, matiere) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, username, prenom, nom, email, role, statut, matiere",
      [username, hashedPassword, prenom, nom, email, userRole, "valide", matiere || null]
    );

    res.json({
      message: "Compte créé avec succès",
      user: result.rows[0]
    });
  } catch (err) {
    console.error("Erreur register:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// ===== ROUTES PASSWORD RESET =====

app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email requis" });
    }

    const userResult = await pool.query(
      "SELECT id, username, prenom FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: "Aucun compte associé à cet email" });
    }

    const user = userResult.rows[0];
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000);

    await pool.query(
      "INSERT INTO password_reset_tokens (email, token, expires_at) VALUES ($1, $2, $3)",
      [email, token, expiresAt]
    );

    const resetLink = `${process.env.FRONTEND_URL || "http://localhost:10000"}/reset_password.html?token=${token}`;

    if (emailEnabled && transporter) {
      // Envoyer l'email sans bloquer la requête
      transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Réinitialiser votre mot de passe - Plateforme Scolaire",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">Réinitialisation de mot de passe</h2>
            <p>Bonjour ${user.prenom},</p>
            <p>Vous avez demandé la réinitialisation de votre mot de passe.</p>
            <p style="margin: 30px 0;">
              <a href="${resetLink}" style="background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Réinitialiser mon mot de passe
              </a>
            </p>
            <p style="color: #999; font-size: 12px;">⏱️ Ce lien expire dans 1 heure.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin-top: 30px;">
            <p style="color: #999; font-size: 11px;">Plateforme Scolaire Global - Soutien en ligne 24/7</p>
          </div>
        `
      }).catch(err => {
        // Logger l'erreur mais ne pas interrompre
        console.log("⚠️ Email non envoyé:", err.message);
      });

      res.json({ message: "Email de réinitialisation envoyé" });
    } else {
      res.json({ message: "Token généré. Service email indisponible pour l'instant." });
    }

  } catch (err) {
    console.error("Erreur forgot-password:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

app.get("/api/auth/verify-token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      "SELECT email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()",
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Token invalide ou expiré" });
    }

    res.json({ message: "Token valide", email: result.rows[0].email });

  } catch (err) {
    console.error("Erreur verify-token:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token et password requis" });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Le mot de passe doit contenir au moins 8 caractères" });
    }

    const tokenResult = await pool.query(
      "SELECT email FROM password_reset_tokens WHERE token = $1 AND expires_at > NOW()",
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ message: "Token invalide ou expiré" });
    }

    const email = tokenResult.rows[0].email;
    const hashedPassword = await bcrypt.hash(password, 10);

    const updateResult = await pool.query(
      "UPDATE users SET password = $1 WHERE email = $2 RETURNING username, prenom",
      [hashedPassword, email]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ message: "Utilisateur non trouvé" });
    }

    await pool.query(
      "DELETE FROM password_reset_tokens WHERE email = $1",
      [email]
    );

    res.json({ message: "Mot de passe réinitialisé avec succès" });

  } catch (err) {
    console.error("Erreur reset-password:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});

// --- Static files ---
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

const docsDir = path.join(publicPath, "documents");
const corrDir = path.join(publicPath, "corrections");

if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
if (!fs.existsSync(corrDir)) fs.mkdirSync(corrDir, { recursive: true });

app.use("/documents", express.static(docsDir));
app.use("/corrections", express.static(corrDir));

// --- HTTP server + WebSocket ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// --- WS maps ---
const clients = new Map(); // Tous les clients (prof + eleve)
const connectedProfs = new Map(); // Seulement les profs
const appelsEnAttente = new Map();
const appelsEnCours = new Map();

// --- WS connection ---
wss.on("connection", (ws) => {
  console.log("✅ Nouvelle connexion WebSocket");
  let currentUsername = null;
  let currentRole = null;
  let currentCountry = null;
  let currentSubjects = [];
  let currentLanguages = [];

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      // ===== REGISTRATION =====
      if (data.type === "register") {
        currentUsername = data.username;
        currentCountry = data.country || "Inconnu";
        currentSubjects = data.subjects || [];
        currentLanguages = data.languages || [];

        try {
          const userResult = await pool.query(
            "SELECT role FROM users WHERE username = $1",
            [currentUsername]
          );

          if (userResult.rows.length === 0) {
            ws.send(JSON.stringify({ type: "erreur", message: "Utilisateur introuvable" }));
            ws.close();
            return;
          }

          currentRole = userResult.rows[0].role;
        } catch (dbErr) {
          console.error("❌ Erreur récupération role:", dbErr);
          ws.send(JSON.stringify({ type: "erreur", message: "Erreur serveur" }));
          ws.close();
          return;
        }

        if (clients.has(currentUsername)) {
          ws.send(JSON.stringify({ type: "erreur", message: "Utilisateur déjà connecté" }));
          ws.close();
          return;
        }

        clients.set(currentUsername, ws);

        // Si c'est un prof
        if (currentRole === "prof") {
          connectedProfs.set(currentUsername, { 
            ws, 
            disponible: true, 
            country: currentCountry,
            subjects: currentSubjects,
            languages: currentLanguages
          });
          appelsEnAttente.set(currentUsername, []);
        }

        // Broadcaster immédiatement la liste mise à jour
        broadcastProfListToAll();
        console.log(`✅ ${currentUsername} connecté (${currentRole}) depuis ${currentCountry}`);
        return;
      }

      // ===== UPDATE PROF PROFILE =====
      if (data.type === "updateProfProfile") {
        if (currentRole === "prof") {
          currentCountry = data.country || currentCountry;
          currentSubjects = data.subjects || currentSubjects;
          currentLanguages = data.languages || currentLanguages;

          const prof = connectedProfs.get(currentUsername);
          if (prof) {
            prof.country = currentCountry;
            prof.subjects = currentSubjects;
            prof.languages = currentLanguages;
            connectedProfs.set(currentUsername, prof);
          }
          broadcastProfListToAll();
        }
        return;
      }

      // ===== DEMAND APPEL =====
      if (data.type === "demandAppel") {
        const prof = connectedProfs.get(data.target);
        if (!prof) {
          ws.send(JSON.stringify({ type: "erreur", message: "Prof non disponible" }));
          return;
        }

        const appels = appelsEnAttente.get(data.target) || [];
        if (!appels.find(a => a.eleve === data.sender)) {
          appels.push({
            eleve: data.sender,
            country: data.senderCountry,
            subject: data.subject,
            timestamp: new Date().toISOString(),
            statut: "en_attente"
          });
          appelsEnAttente.set(data.target, appels);

          if (prof.ws && prof.ws.readyState === 1) {
            prof.ws.send(JSON.stringify({ type: "appelEnAttente", appels }));
          }
          ws.send(JSON.stringify({ type: "demandAppelConfirmee", prof: data.target }));
        }
        return;
      }

      // ===== ACCEPTER APPEL =====
      if (data.type === "accepterAppel") {
        const { prof, eleve } = data;
        const key = `${prof}_${eleve}`;
        appelsEnCours.set(key, { startTime: new Date(), timer: null });

        await pool.query(
          `INSERT INTO appels (prof_username, eleve_username, start_time, statut)
           VALUES ($1, $2, NOW(), 'en_cours')`,
          [prof, eleve]
        );

        const eleveWs = clients.get(eleve);
        if (eleveWs && eleveWs.readyState === 1) {
          eleveWs.send(JSON.stringify({
            type: 'appelAccepte',
            prof,
            profCountry: currentCountry,
            eleve
          }));
        }

        const timer = setInterval(() => {
          const callData = appelsEnCours.get(key);
          if (!callData) {
            clearInterval(timer);
            return;
          }
          const wsProf = connectedProfs.get(prof)?.ws;
          const wsEleve = clients.get(eleve);
          const elapsed = Math.floor((new Date() - callData.startTime) / 1000);
          const msg = JSON.stringify({ type: "timerUpdate", elapsed });
          if (wsProf?.readyState === 1) wsProf.send(msg);
          if (wsEleve?.readyState === 1) wsEleve.send(msg);
        }, 1000);
        appelsEnCours.get(key).timer = timer;
        
        // Broadcast après acceptation pour mettre à jour la disponibilité
        broadcastProfListToAll();
        return;
      }

      // ===== APPEL TERMINE =====
      if (data.type === "appelTermine") {
        const { prof, eleve, duration } = data;
        const key = `${prof}_${eleve}`;
        const callData = appelsEnCours.get(key);
        
        if (callData) {
          clearInterval(callData.timer);
          const durationMinutes = Math.round((duration / 60) * 100) / 100;

          await pool.query(
            `UPDATE appels
             SET end_time = NOW(),
                 duree_minutes = $1,
                 statut = 'termine'
             WHERE prof_username = $2 AND eleve_username = $3 AND statut = 'en_cours'`,
            [durationMinutes, prof, eleve]
          );
          appelsEnCours.delete(key);
        }

        const other = clients.get(prof) || connectedProfs.get(eleve)?.ws;
        if (other && other.readyState === 1) {
          other.send(JSON.stringify({ type: "appelTermine" }));
        }

        broadcastProfListToAll();
        return;
      }

      // ===== REJETER APPEL =====
      if (data.type === "rejeterAppel") {
        const appels = appelsEnAttente.get(currentUsername) || [];
        const filtered = appels.filter(a => a.eleve !== data.eleveRejete);
        appelsEnAttente.set(currentUsername, filtered);

        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "appelEnAttente", appels: filtered }));
        }
        return;
      }

      // ===== WEBRTC SIGNALING =====
      if (["offer", "answer", "ice"].includes(data.type)) {
        const target = clients.get(data.target) || connectedProfs.get(data.target)?.ws;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({ ...data, sender: currentUsername }));
        }
        return;
      }

      // ===== CHAT =====
      if (data.type === "chat") {
        const target = clients.get(data.target) || connectedProfs.get(data.target)?.ws;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({
            type: "chat",
            sender: currentUsername,
            message: data.message,
            timestamp: new Date()
          }));
        }
        return;
      }

      // ===== FILE UPLOAD =====
      if (data.type === "fileUpload") {
        const target = clients.get(data.target) || connectedProfs.get(data.target)?.ws;
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({
            type: "newFile",
            sender: currentUsername,
            filename: data.filename,
            content: data.content
          }));
        }
        return;
      }

    } catch (error) {
      console.error("❌ Erreur WS:", error.message);
      ws.send(JSON.stringify({ type: "erreur", message: error.message }));
    }
  });

  ws.on("close", () => {
    if (!currentUsername) return;
    console.log(`❌ ${currentUsername} déconnecté`);
    clients.delete(currentUsername);
    if (currentRole === "prof") {
      connectedProfs.delete(currentUsername);
      appelsEnAttente.delete(currentUsername);
    }
    broadcastProfListToAll();
  });
});

// ===== BROADCAST FUNCTIONS =====
function broadcastProfListToAll() {
  const profList = [];
  for (const [username, prof] of connectedProfs.entries()) {
    const appels = appelsEnAttente.get(username) || [];
    profList.push({
      username,
      disponible: appels.length === 0,
      country: prof.country,
      subjects: prof.subjects,
      languages: prof.languages,
      appelsEnAttente: appels.length
    });
  }

  const message = JSON.stringify({ type: "profList", profs: profList });
  
  console.log(`📊 Broadcasting ${profList.length} profs à ${clients.size} clients`);
  
  // Envoyer à TOUS les clients connectés
  for (const [username, ws] of clients.entries()) {
    if (ws && ws.readyState === 1) {
      ws.send(message);
    }
  }
}

function broadcastWaitingList() {
  for (const [profUsername, profData] of connectedProfs.entries()) {
    const appels = appelsEnAttente.get(profUsername) || [];
    if (profData.ws && profData.ws.readyState === 1) {
      profData.ws.send(JSON.stringify({ type: "appelEnAttente", appels }));
    }
  }
}

// --- Export pool pour les autres routes ---
export { pool };

// --- Start server ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`✅ Serveur lancé sur http://localhost:${PORT}`);
  console.log(`📊 Email service: ${emailEnabled ? '✅ ACTIVÉ' : '❌ DÉSACTIVÉ'}`);
});