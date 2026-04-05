// 1. Détection dynamique de l'URL de base
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

// 2. Configuration de la route API
const API_BASE = `${API_URL}/api/v1`; // Utilise maintenant API_URL !

// 🔹 Vérifier si déjà connecté
const storedUser = localStorage.getItem("currentUser");
const token = localStorage.getItem("token");

if (storedUser && token) {
  try {
    const user = JSON.parse(storedUser);
    if (user.role === "prof") {
      window.location.replace("../../pages/professeur/dashboard.html");
    }
  } catch (e) {
    localStorage.clear();
  }
}

localStorage.removeItem("token");

const loginForm = document.getElementById("loginProfForm");
const errorDiv = document.getElementById("errorDiv");
const successDiv = document.getElementById("successDiv");
const loadingDiv = document.getElementById("loadingDiv");
const submitBtn = document.getElementById("submitBtn");

/**
 * Fonction de connexion professeur
 */
async function loginProfesseur(event) {
  event.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();
  const matiere = document.getElementById("matiere").value.trim();
  const niveau = document.getElementById("niveau").value.trim();

  if (!username || !password || !matiere || !niveau) {
    showError("Tous les champs sont requis");
    return;
  }

  try {
    showLoading(true);
    hideError();
    hideSuccess();

    console.log("📤 Connexion en cours pour:", username);

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    const json = await res.json();
    console.log("📥 Réponse serveur:", json);

    if (!res.ok) throw new Error(json.message || "Connexion échouée");

    const accessToken = json.accessToken;
    const currentUser = json.user;

    if (!accessToken) throw new Error("Token absent dans la réponse serveur");
    if (!currentUser || currentUser.role !== "prof")
      throw new Error("Cet utilisateur n'est pas professeur");

    // Enrichir utilisateur
    currentUser.matiere = matiere;
    currentUser.niveau = niveau;

    // Stockage
    localStorage.setItem("token", accessToken);
    localStorage.setItem("currentUser", JSON.stringify(currentUser));

    console.log("✅ Données stockées:", { token: "***", user: currentUser });

    showSuccess("Connexion réussie! Redirection...");

    // 🚀 Redirection vers dashboard professeur
    setTimeout(() => {
      window.location.replace("../../pages/professeur/dashboard.html");
    }, 1000);

  } catch (err) {
    console.error("❌ Erreur:", err);
    showError(err.message || "Erreur de connexion");
    showLoading(false);
  }
}

/**
 * Affichage / masquage messages
 */
function showError(msg) {
  errorDiv.textContent = "❌ " + msg;
  errorDiv.classList.add("show");
}
function hideError() { errorDiv.classList.remove("show"); }

function showSuccess(msg) {
  successDiv.textContent = "✅ " + msg;
  successDiv.classList.add("show");
}
function hideSuccess() { successDiv.classList.remove("show"); }

function showLoading(isLoading) {
  if (isLoading) {
    loadingDiv.textContent = "⏳ Connexion en cours...";
    loadingDiv.classList.add("show");
    submitBtn.disabled = true;
  } else {
    loadingDiv.classList.remove("show");
    submitBtn.disabled = false;
  }
}

// Bind formulaire
loginForm.addEventListener("submit", loginProfesseur);

// Nettoyer messages au focus
document.getElementById("username").addEventListener("focus", hideError);
document.getElementById("password").addEventListener("focus", hideError);
