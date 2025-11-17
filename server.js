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
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  ssl: { rejectUnauthorized: false }
});

pool.connect()
  .then(() => console.log("✅ Connecté à PostgreSQL"))
  .catch(err => console.error("❌ Erreur PostgreSQL :", err));

// --- API routes ---
app.use("/api/auth", authRoutes);
app.use("/api", adminRoutes);

app.get("/api", (req, res) => {
  res.json({ message: "Bienvenue sur l'API soutien scolaire 📚" });
});

// --- ROUTE LOGIN ---
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password, role } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Username et password requis" });
    }

    const result = await pool.query(
      "SELECT id, username, password, prenom, nom, statut FROM professeurs WHERE username = $1",
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Utilisateur introuvable" });
    }

    const prof = result.rows[0];

    const validPassword = await bcrypt.compare(password, prof.password);
    if (!validPassword) {
      return res.status(401).json({ message: "Mot de passe incorrect" });
    }

    res.json({
      prof: {
        id: prof.id,
        username: prof.username,
        prenom: prof.prenom,
        nom: prof.nom,
        statut: prof.statut
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
    const { username, password, prenom, nom } = req.body;

    if (!username || !password || !prenom || !nom) {
      return res.status(400).json({ message: "Tous les champs sont requis" });
    }

    const check = await pool.query(
      "SELECT id FROM professeurs WHERE username = $1",
      [username]
    );

    if (check.rows.length > 0) {
      return res.status(400).json({ message: "Username déjà utilisé" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO professeurs (username, password, prenom, nom, statut) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, prenom, nom, statut",
      [username, hashedPassword, prenom, nom, "en attente"]
    );

    res.json({
      message: "Compte créé avec succès",
      prof: result.rows[0]
    });
  } catch (err) {
    console.error("Erreur register:", err);
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
const clients = new Map();
const connectedProfs = new Map();
const appelsEnAttente = new Map();
const appelsEnCours = new Map();

// --- WS connection ---
wss.on("connection", (ws) => {
  console.log("✅ Nouvelle connexion WebSocket");
  let currentUsername = null;
  let currentRole = null;

  ws.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.type === "register") {
        currentUsername = data.username;
        currentRole = data.role || "eleve";

        if (clients.has(currentUsername)) {
          ws.send(JSON.stringify({ type: "erreur", message: "Nom d'utilisateur déjà connecté" }));
          ws.close();
          return;
        }

        clients.set(currentUsername, ws);

        if (currentRole === "prof") {
          connectedProfs.set(currentUsername, { ws, disponible: true });
          appelsEnAttente.set(currentUsername, []);
        }

        broadcastProfList();
        return;
      }

      if (data.type === "demandAppel") {
        const prof = connectedProfs.get(data.target);
        if (!prof) return ws.send(JSON.stringify({ type: "erreur", message: "Prof non disponible" }));

        const appels = appelsEnAttente.get(data.target) || [];
        if (!appels.find(a => a.eleve === data.sender)) {
          appels.push({ eleve: data.sender, timestamp: new Date().toISOString(), statut: "en_attente" });
          appelsEnAttente.set(data.target, appels);

          if (prof.ws.readyState === 1) prof.ws.send(JSON.stringify({ type: "appelEnAttente", appels }));
          ws.send(JSON.stringify({ type: "demandAppelConfirmee", prof: data.target }));
        }
        return;
      }

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
          eleveWs.send(JSON.stringify({ type: 'appelAccepte', prof, eleve }));
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
        return;
      }

      if (data.type === "appelTermine") {
        const { prof, eleve } = data;
        const key = `${prof}_${eleve}`;
        const callData = appelsEnCours.get(key);
        if (callData) {
          clearInterval(callData.timer);
          const durationMinutes = Math.round(((new Date() - callData.startTime) / 60000) * 100) / 100;

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
        return;
      }

      if (["offer","answer","ice"].includes(data.type)) {
        const target = clients.get(data.target) || connectedProfs.get(data.target)?.ws;
        if (target?.readyState === 1) target.send(JSON.stringify({ ...data, sender: currentUsername }));
      }

      if (data.type === "chat") {
        const target = clients.get(data.target) || connectedProfs.get(data.target)?.ws;
        if (target?.readyState === 1) target.send(JSON.stringify({ type:"chat", sender: currentUsername, message: data.message, timestamp: new Date() }));
      }

      if (data.type === "fileUpload") {
        const target = clients.get(data.target) || connectedProfs.get(data.target)?.ws;
        if (target?.readyState === 1) target.send(JSON.stringify({ type:"newFile", sender: currentUsername, filename: data.filename, content: data.content }));
      }

    } catch (error) {
      console.error("❌ Erreur WS:", error.message);
      ws.send(JSON.stringify({ type: "erreur", message: error.message }));
    }
  });

  ws.on("close", () => {
    if (!currentUsername) return;
    clients.delete(currentUsername);
    if (currentRole === "prof") {
      connectedProfs.delete(currentUsername);
      appelsEnAttente.delete(currentUsername);
      broadcastProfList();
    }
  });
});

// --- BROADCAST PROF LIST ---
function broadcastProfList() {
  const profList = [];
  for (const [username, prof] of connectedProfs.entries()) {
    const appels = appelsEnAttente.get(username) || [];
    profList.push({ username, disponible: prof.disponible, appelsEnAttente: appels.length });
  }
  const message = JSON.stringify({ type: "profList", profs: profList });
  for (const ws of clients.values()) if (ws.readyState === 1) ws.send(message);
}

// --- Start server ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`✅ Serveur lancé sur http://localhost:${PORT}`));