// ============================================
// app.js - Configuration Express (propre & minimaliste)
// ============================================

console.log("NODE SERVER TIME =", new Date());

// 🛠️ CORRECTION 1 : Charger les variables d'environnement en TOUT PREMIER
import "dotenv/config"; 

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import signupRoutes from "./routes/v1/auth/signup.routes.js"; // Ton nouveau fichier
// Middlewares custom
import errorMiddleware from "./middlewares/error.middleware.js";
import { requireAuth } from "./middlewares/requireAuth.js";
import { requireRole } from "./middlewares/requireRole.js";

// =======================================================
// Imports des routes
// =======================================================
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

// =======================================================
// Initialisation
// =======================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// =======================================================
// CORS - Configuration Robuste
// =======================================================
const allowedOrigins = [
  "http://localhost:4000", 
  "https://plateforme-scolaire-1.onrender.com" // ✅ Votre URL Render
];

app.use(cors({
  origin: function (origin, callback) {
    // Autorise les requêtes sans origine (Postman) ou si l'URL est dans la liste
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Accès refusé par CORS"));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true // 🔐 CRUCIAL pour l'auth et Stripe Connect
}));

app.options("*", cors()); // Gère les requêtes "Preflight"
// =======================================================
// Webhook (doit être AVANT express.json)
// =======================================================
// 🛠️ CORRECTION 3 : Harmonisation avec l'API v1 (Optionnel)
app.use("/api/v1/webhooks", webhookRoutes);

// =======================================================
// Middlewares Express
// =======================================================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// =======================================================
// Vues (EJS)
// =======================================================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// =======================================================
// Fichiers statiques
// =======================================================
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// =======================================================
// Pages frontend protégées
// =======================================================
app.get("/etudiant/dashboard", requireAuth, (req, res) => {
  res.sendFile(
    path.join(publicPath, "pages/etudiant/dashboard.html")
  );
});

// =======================================================
// Documents et corrections (static)
// =======================================================
const docsDir = path.join(publicPath, "documents");
const corrDir = path.join(publicPath, "corrections");
const uploadDir = path.join(__dirname, "uploads/diplomes");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

if (!fs.existsSync(corrDir)) {
  fs.mkdirSync(corrDir, { recursive: true });
}

app.use("/documents", express.static(docsDir));
app.use("/corrections", express.static(corrDir));

// Route paiement (utilisateur connecté uniquement)
app.get("/paiement", requireAuth, (req, res) => {
  res.sendFile(path.join(publicPath, "paiement.html"));
});

// =======================================================
// API Routes
// =======================================================
app.use("/api/v1/auth", signupRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/eleves", elevesRoutes);
app.use("/api/v1/professeurs", professeursRoutes);
app.use("/api/v1/appels", appelsRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/admin/users", adminUsersRoutes);
app.use("/api/v1/twilio", twilioRoutes);
app.use("/api/v1/twilio", twilioStudentRoute);
app.use("/api/v1/turn", turnRoutes);
app.use("/api/v1/users/profile", profileRoutes);
app.use("/api/v1/stripeConnect", stripeConnectRoutes);

// Route test API
app.get("/api", (req, res) => {
  res.json({
    message: "Bienvenue sur l'API Plateforme Scolaire 📚",
    frontendUrl: process.env.FRONTEND_URL || "http://localhost:10000",
  });
});

// =======================================================
// Middleware global d’erreurs (TOUJOURS en dernier)
// =======================================================
app.use(errorMiddleware);

export default app;