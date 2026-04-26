// ============================================
// app.js - CONFIGURATION FINALE SANS OUBLI
// ============================================

console.log("NODE SERVER TIME =", new Date()); 
console.log("FRONTEND_URL =", process.env.FRONTEND_URL);
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import helmet from "helmet";

// Middlewares custom
import errorMiddleware from "./middlewares/error.middleware.js";
import { requireAuth } from "./middlewares/requireAuth.js";
import { requireRole } from "./middlewares/requireRole.js"; // ✅ RÉAJOUTÉ

// Imports des routes
import signupRoutes from "./routes/v1/auth/signup.routes.js";
import webhookRoutes from "./routes/v1/webhooks/webhook.routes.js";
import authRoutes from "./routes/v1/auth/auth.routes.js";
import elevesRoutes from "./routes/v1/eleves/elevesRoutes.js";
import professeursRoutes from "./routes/v1/professeurs/professeursRoutes.js";
import appelsRoutes from "./routes/v1/appels/appels.routes.js";
import adminRoutes from "./routes/v1/admin/adminRoutes.js";
import adminUsersRoutes from "./routes/v1/admin/users.js";
import twilioRoutes from "./routes/v1/twilio/twilio.routes.js";
import twilioStudentRoute from "./routes/v1/twilio/twilio.student.routes.js";
import turnRoutes from "./routes/v1/turn/turn.routes.js";
import profileRoutes from "./routes/v1/users/profile.routes.js";
import stripeConnectRoutes from "./routes/v1/stripeConnect.routes.js";
import whiteboardRoutes from "./routes/whiteboard.routes.js"; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// =======================================================
// SÉCURITÉ & CSP (Helmet)
// =======================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      "default-src": ["'self'"],
      "connect-src": [
        "'self'", 
        "http://localhost:4000", 
        "http://localhost:*", // Optionnel mais utile pour le debug
        "https://plateforme-scolaire-1.onrender.com", 
        "wss://*", 
        "https://*.twilio.com", 
        "wss://*.twilio.com"
      ],
      "script-src": [
        "'self'", 
        "'unsafe-inline'", 
        "https://sdk.twilio.com"
      ],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      "img-src": ["'self'", "data:", "https://res.cloudinary.com"],
      "font-src": ["'self'", "https://fonts.gstatic.com"],
    },
  },
  xssFilter: false,
}));
// ✅ AJOUTE CETTE ROUTE juste après tes middlewares pour supprimer les 404 polluants
app.use((req, res, next) => {
  if (req.url.includes('6babaf8f') || req.url.includes('.well-known')) {
    return res.status(204).end();
  }
  next();
});
// =======================================================
// CORS (Correction pour PATCH)
// =======================================================
const allowedOrigins = ["http://localhost:4000", "https://plateforme-scolaire-1.onrender.com"];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error("Accès refusé par CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
app.options("*", cors()); 

// =======================================================
// MIDDLEWARES STANDARDS
// =======================================================
app.use("/api/v1/webhooks", webhookRoutes); 
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// =======================================================
// VUES & STATIQUE
// =======================================================
app.get("/favicon.ico", (req, res) => res.status(204).send());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const publicPath = path.join(__dirname, "public");

// ✅ Retour Stripe — redirige selon le rôle
app.get("/stripe/success", (req, res) => {
  res.sendFile(path.join(publicPath, "stripe/success.html"));
});

app.get("/stripe/refresh", (req, res) => {
  res.sendFile(path.join(publicPath, "stripe/success.html"));
});

app.use(express.static(publicPath)); // ← doit rester APRÈS
app.use("/invoices", express.static(path.join(process.cwd(), "invoices")));
// Favicon
app.get('/favicon.ico', (req, res) => {
    const p = path.join(publicPath, 'favicon.ico');
    if (fs.existsSync(p)) res.sendFile(p); else res.status(204).end();
});

// =======================================================
// DOSSIERS & DOCUMENTS
// =======================================================
const docsDir = path.join(publicPath, "documents");
const corrDir = path.join(publicPath, "corrections");
const uploadDir = path.join(__dirname, "uploads/diplomes");

[uploadDir, docsDir, corrDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use("/documents", express.static(docsDir));
app.use("/corrections", express.static(corrDir));
app.use("/uploads/diplomes", express.static(uploadDir));
// =======================================================
// PAGES FRONTEND PROTÉGÉES
// =======================================================
app.get("/etudiant/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(publicPath, "pages/etudiant/dashboard.html"));
});
// =======================================================
// ROUTE GÉNÉRIQUE POUR LES PAGES ADMIN
// (Remplace ta route spécifique /admin_inscriptions_professeurs.html)
// =======================================================
// =======================================================
// PAGES FRONTEND PROTÉGÉES
// =======================================================

// 1. Dashboard Étudiant
app.get("/etudiant/dashboard", requireAuth, (req, res) => {
  res.sendFile(path.join(publicPath, "pages/etudiant/dashboard.html"));
});

// 2. ROUTE GÉNÉRIQUE ADMIN (Remplace toutes les routes individuelles admin_*.html)
// Cette route gère professeurs, élèves, parents, etc., en une seule fois.
// Route pour servir les pages admin HTML
app.get("/admin_*.html", requireAuth, (req, res) => {
    const fileName = req.path.split("/").pop();
    
    // On utilise path.resolve pour garantir un chemin absolu propre
    const filePath = path.resolve(process.cwd(), "public", fileName);

    res.sendFile(filePath, (err) => {
        if (err) {
            // Log précis pour t'aider à débugger dans la console Render si besoin
            console.error(`[404] Page admin introuvable : ${filePath}`);
            
            // On vérifie si c'est une erreur de permission ou de fichier manquant
            if (!res.headersSent) {
                res.status(404).send("Désolé, cette page de gestion est introuvable sur le serveur.");
            }
        } else {
            console.log(`[SERVED] ${fileName} envoyé avec succès.`);
        }
    });
});

// 3. Route Paiement
app.get("/paiement", requireAuth, (req, res) => {
  res.sendFile(path.join(publicPath, "paiement.html"));
});
// ✅ Retour après onboarding Stripe professeu
// ✅ Après — redirection selon le rôle
app.get("/stripe/success", (req, res) => {
  const token = req.query.token || req.cookies?.token;
  // On redirige selon l'URL de retour Stripe qui contient le rôle
  // Par défaut on redirige vers élève car c'est le Setup Intent
  res.redirect("/pages/eleve/dashboard.html?stripe=success");
});

app.get("/stripe/refresh", (req, res) => {
  res.redirect("/pages/professeur/dashboard.html?stripe=refresh");
});
// =======================================================
// API ROUTES
// =======================================================
// ✅ Capture et ignore les requêtes bizarres des extensions Chrome/DevTools
app.get(['/6babaf8f211263c914e3ecc3691fff46', '/.well-known/*'], (req, res) => {
    res.status(204).end(); // Réponse "No Content" propre
});
app.use("/api/v1/auth", signupRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/eleves", elevesRoutes);
app.use("/api/v1/professeurs", professeursRoutes);
app.use("/api/v1/appels", appelsRoutes);
app.use("/api/v1/admin", adminRoutes);
//app.use("/api/v1/admin/users", adminUsersRoutes);
// (Car tes routes /users sont déjà gérées à l'intérieur de adminRoutes.js)
app.use("/api/v1/twilio", twilioRoutes);
app.use("/api/v1/twilio", twilioStudentRoute);
app.use("/api/v1/turn", turnRoutes);
app.use("/api/v1/users/profile", profileRoutes);
app.use("/api/v1/stripeConnect", stripeConnectRoutes);
app.use("/api/whiteboard", whiteboardRoutes);

app.get("/api", (req, res) => {
  res.json({
    message: "Bienvenue sur l'API Plateforme Scolaire 📚",
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:10000",
  });
});

// ⚠️ TEMPORAIRE — Créer table notifications sur Render
app.get("/setup-db", async (req, res) => {
  try {
    const { db } = await import("./config/index.js");
    await db.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        type VARCHAR(50) NOT NULL,
        data JSONB,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    res.send("✅ Table notifications créée");
  } catch (err) {
    res.status(500).send("❌ Erreur: " + err.message);
  }
});

app.use(errorMiddleware);

export default app;