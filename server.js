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

// --- Static folders setup ---
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

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

app.use("/documents", express.static(docsDir));
app.use("/corrections", express.static(corrDir));

// --- WebSocket setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map(); // username → ws
const connectedProfs = new Map(); // username → { ws, disponible, appelEnAttente }
const appelsEnAttente = new Map(); // prof_username → [{ eleve, timestamp, statut }]

wss.on("connection", (ws) => {
  console.log("✅ Nouvelle connexion WebSocket");

  let currentUsername = null;
  let currentRole = null;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📨 Message reçu:", data.type);

      // --- USER REGISTRATION ---
     if (data.type === "register") {
    currentUsername = data.username;
    currentRole = data.role || "eleve";

    clients.set(currentUsername, ws);

    if (currentRole === "prof") {
      connectedProfs.set(currentUsername, { ws, disponible: true });
      appelsEnAttente.set(currentUsername, []);
      console.log(`✅ Prof "${currentUsername}" enregistré`);
    } else {
      console.log(`✅ Élève "${currentUsername}" enregistré`);
    }
    
    // ✅ Appeler pour TOUS les utilisateurs (profs ET élèves)
    broadcastProfList();
    return;
 }

      // --- CALL REQUEST (Élève appelle un prof) ---
      if (data.type === "demandAppel") {
        const prof = connectedProfs.get(data.target);
        if (!prof) {
          console.log(`⚠️ Prof "${data.target}" non connecté`);
          ws.send(JSON.stringify({ type: "erreur", message: "Le professeur n'est pas disponible" }));
          return;
        }

        const appels = appelsEnAttente.get(data.target) || [];
        
        // Vérifier si l'élève n'a pas déjà un appel en attente
        if (!appels.find(a => a.eleve === data.sender)) {
          appels.push({ 
            eleve: data.sender, 
            timestamp: new Date().toISOString(), 
            statut: "en_attente" 
          });
          appelsEnAttente.set(data.target, appels);

          // Notifier le prof
          if (prof.ws.readyState === 1) {
            prof.ws.send(JSON.stringify({ 
              type: "appelEnAttente", 
              appels: appels 
            }));
          }

          // Confirmer à l'élève
          ws.send(JSON.stringify({ 
            type: "demandAppelConfirmee", 
            prof: data.target, 
            message: "Votre demande d'appel a été envoyée" 
          }));
          console.log(`📞 Appel de "${data.sender}" vers "${data.target}"`);
        }
        return;
      }

      // --- GET PENDING CALLS (Prof demande ses appels en attente) ---
      if (data.type === "getAppelsEnAttente") {
        const appels = appelsEnAttente.get(currentUsername) || [];
        ws.send(JSON.stringify({ 
          type: "appelEnAttente", 
          appels: appels.filter(a => a.statut === "en_attente") 
        }));
        return;
      }

      // --- ACCEPT CALL ---
      if (data.type === "accepterAppel") {
        const appels = appelsEnAttente.get(currentUsername) || [];
        const appelIndex = appels.findIndex(a => a.eleve === data.eleveAccepte);
        
        if (appelIndex !== -1) {
          appels[appelIndex].statut = "accepté";
          
          // Notifier l'élève
          const eleveWs = clients.get(data.eleveAccepte);
          if (eleveWs && eleveWs.readyState === 1) {
            eleveWs.send(JSON.stringify({ 
              type: "appelAccepte", 
              prof: currentUsername 
            }));
          }

          console.log(`✅ Appel accepté: "${currentUsername}" <- "${data.eleveAccepte}"`);
        }
        return;
      }

      // --- REJECT CALL ---
      if (data.type === "rejeterAppel") {
        const appels = appelsEnAttente.get(currentUsername) || [];
        const appelIndex = appels.findIndex(a => a.eleve === data.eleveRejete);
        
        if (appelIndex !== -1) {
          appels.splice(appelIndex, 1);
          
          // Notifier l'élève
          const eleveWs = clients.get(data.eleveRejete);
          if (eleveWs && eleveWs.readyState === 1) {
            eleveWs.send(JSON.stringify({ 
              type: "appelRejete", 
              prof: currentUsername 
            }));
          }

          console.log(`❌ Appel rejeté: "${currentUsername}" -> "${data.eleveRejete}"`);
        }
        return;
      }

      // --- WebRTC OFFER ---
      if (data.type === "offer") {
        const target = clients.get(data.target);
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({
            type: "offer",
            offer: data.offer,
            sender: currentUsername
          }));
        }
        return;
      }

      // --- WebRTC ANSWER ---
      if (data.type === "answer") {
        const target = clients.get(data.target);
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({
            type: "answer",
            answer: data.answer,
            sender: currentUsername
          }));
        }
        return;
      }

      // --- ICE CANDIDATE ---
      if (data.type === "ice") {
        const target = clients.get(data.target);
        if (target && target.readyState === 1 && data.candidate) {
          target.send(JSON.stringify({
            type: "ice",
            candidate: data.candidate,
            sender: currentUsername
          }));
        }
        return;
      }

      // --- CHAT MESSAGE ---
      if (data.type === "chat") {
        const target = clients.get(data.target);
        if (target && target.readyState === 1) {
          target.send(JSON.stringify({
            type: "chat",
            message: data.message,
            sender: currentUsername,
            timestamp: new Date().toISOString()
          }));
        }
        return;
      }

    } catch (error) {
      console.error("❌ Erreur traitement message:", error.message);
      ws.send(JSON.stringify({ type: "erreur", message: error.message }));
    }
  });

  ws.on("close", () => {
    if (!currentUsername) return;
    clients.delete(currentUsername);
    if (currentRole === "prof") {
      connectedProfs.delete(currentUsername);
      appelsEnAttente.delete(currentUsername);
      console.log(`🔌 Prof "${currentUsername}" déconnecté`);
      broadcastProfList();
    } else {
      console.log(`🔌 Élève "${currentUsername}" déconnecté`);
    }
  });

  ws.on("error", (err) => {
    console.error("❌ Erreur WS:", err.message);
  });
});

// --- BROADCAST PROF LIST ---
function broadcastProfList() {
  const profList = [];
  for (let [username, prof] of connectedProfs.entries()) {
    const appels = appelsEnAttente.get(username) || [];
    profList.push({ 
      username, 
      disponible: prof.disponible, 
      appelsEnAttente: appels.length 
    });
  }
  const message = JSON.stringify({ type: "profList", profs: profList });
  for (let ws of clients.values()) {
    if (ws.readyState === 1) ws.send(message);
  }
}
// === API Professeurs ===
app.get("/api/professeurs", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM professeurs");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Erreur:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
});
// --- Redirections ---
app.get("/login_prof.html", (req, res) => {
  res.redirect("/login.html");
});

app.get("/register_prof.html", (req, res) => {
  res.redirect("/register_prof.html");
});
// --- START SERVER ---
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║ ✅ SERVEUR LANCÉ sur http://localhost:${PORT}
║ 📚 Élève: http://localhost:${PORT}/login_eleve.html
║ 👨‍🏫 Prof: http://localhost:${PORT}/login.html
║ 🔌 WebSocket: ws://localhost:${PORT}
╚════════════════════════════════════════╝
  `);
});