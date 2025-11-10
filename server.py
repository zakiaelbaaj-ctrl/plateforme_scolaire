// server.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { WebSocketServer } from "ws";
import http from "http";
import pkg from "pg";
import authRoutes from "./routes/authRoutes.js";

dotenv.config();
const { Pool } = pkg;

// --- Express setup ---
const app = express();
app.use(express.json());

// --- Define __dirname for ES modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- PostgreSQL connection ---
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

pool.connect()
  .then(() => console.log("✅ Connecté à PostgreSQL"))
  .catch(err => console.error("❌ Erreur PostgreSQL :", err));

// --- API routes ---
app.use("/api/auth", authRoutes);
app.get("/api", (req, res) => {
  res.json({ message: "Bienvenue sur ton API de soutien scolaire 📚" });
});

// --- Serve static files ---
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// --- Create folders if missing ---
const docsDir = path.join(publicPath, "documents");
const corrDir = path.join(publicPath, "corrections");
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
if (!fs.existsSync(corrDir)) fs.mkdirSync(corrDir, { recursive: true });

// --- File APIs ---
app.get("/api/files", (req, res) => {
  fs.readdir(docsDir, (err, files) => {
    if (err) return res.status(500).json({ error: "Impossible de lire le dossier" });
    res.json(files || []);
  });
});

app.delete("/api/files/:filename", (req, res) => {
  const filePath = path.join(docsDir, req.params.filename);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ error: "Impossible de supprimer le fichier" });
    res.json({ message: "Fichier supprimé" });
  });
});

app.post("/api/corrections", (req, res) => {
  const { filename, content } = req.body;
  if (!filename || !content) return res.status(400).json({ error: "Filename et content requis" });

  const buffer = Buffer.from(content, "base64");
  const filePath = path.join(corrDir, filename);
  fs.writeFile(filePath, buffer, (err) => {
    if (err) return res.status(500).json({ error: "Impossible d'enregistrer la correction" });
    res.json({ message: "Correction envoyée" });
  });
});

// Serve documents & corrections
app.use("/documents", express.static(docsDir));
app.use("/corrections", express.static(corrDir));

// --- WebSocket setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map(); // username → ws
const connectedProfs = new Map(); // username → { ws, disponible, appelEnAttente }

wss.on("connection", (ws) => {
  console.log("✅ Nouvelle connexion WebSocket");

  let currentUsername = null;
  let currentRole = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      // --- USER REGISTRATION ---
      if (data.type === "register") {
        currentUsername = data.username;
        currentRole = data.role || "eleve";

        clients.set(currentUsername, ws);

        if (currentRole === "prof") {
          connectedProfs.set(currentUsername, { ws, disponible: true, appelEnAttente: [] });
          console.log(`✅ Prof ${currentUsername} enregistré`);
          broadcastProfList();
        } else {
          console.log(`✅ Élève ${currentUsername} enregistré`);
        }
        return;
      }

      // --- Other WebSocket logic (calls, chat, WebRTC) ---
      // Keep your existing message handling here

    } catch (error) {
      console.error("❌ Erreur traitement message:", error.message);
    }
  });

  ws.on("close", () => {
    if (!currentUsername) return;
    clients.delete(currentUsername);
    if (currentRole === "prof") {
      connectedProfs.delete(currentUsername);
      broadcastProfList();
    }
  });

  ws.on("error", (err) => console.error("❌ Erreur WS:", err.message));
});

// --- Broadcast prof list to all clients ---
function broadcastProfList() {
  const profList = [];
  for (let [username, prof] of connectedProfs.entries()) {
    profList.push({ username, disponible: prof.disponible, appelEnAttente: prof.appelEnAttente.length });
  }
  const message = JSON.stringify({ type: "profList", profs: profList });
  for (let ws of clients.values()) if (ws.readyState === 1) ws.send(message);
}

// --- Start server ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`\n✅ SERVEUR LANCÉ sur http://localhost:${PORT}`);
  console.log(`📚 Élève: http://localhost:${PORT}/login_eleve.html`);
  console.log(`👨‍🏫 Prof: http://localhost:${PORT}
