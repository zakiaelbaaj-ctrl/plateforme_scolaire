// ============================================
// 🔐 LOGIN ÉTUDIANT
// ============================================

const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

const API_BASE = `${API_URL}/api/v1`;

// 🔹 Vérifier si l'étudiant est déjà connecté
const existingToken = localStorage.getItem("token");
if (existingToken) {
  // ✅ Redirection relative pour le mode "double-clic" (même dossier)
  window.location.replace("dashboard.html");
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginEtudiantForm");
  const errorDiv = document.getElementById("errorDiv");
  const successDiv = document.getElementById("successDiv");
  const loadingDiv = document.getElementById("loadingDiv");
  const submitBtn = document.getElementById("submitBtn");
  const registerLink = document.getElementById("registerLink");

  if (!loginForm) return;

  if (registerLink) {
    registerLink.addEventListener("click", (e) => {
      e.preventDefault(); 
      // ✅ Redirection relative
      window.location.href = "register.html";
    });
  }

 async function loginEtudiant(event) {
  event.preventDefault();

  // "username" ici correspond à l'identifiant tapé par l'utilisateur (ça peut être un email ou un pseudo)
  const username = document.getElementById("username")?.value.trim();
  const password = document.getElementById("password")?.value.trim();
  const matiere = document.getElementById("matiere")?.value.trim();
  const niveau = document.getElementById("niveau")?.value.trim();

  if (!username || !password || !matiere || !niveau) {
    showError("Tous les champs sont requis");
    return;
  }

  try {
    showLoading(true);
    hideError();
    hideSuccess();

    // 💡 CORRECTION : Détection automatique Email vs Pseudo
    const isEmail = username.includes("@");
    const requestBody = {
      password: password
    };
    
    if (isEmail) {
      requestBody.email = username;    // Si ça contient un '@', on envoie la clé "email"
    } else {
      requestBody.username = username; // Sinon, on envoie la clé "username"
    }

    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody) // On utilise notre objet dynamique
    });

    const json = await res.json();

    if (!res.ok) {
      // 💡 GESTION DES ERREURS : On lit le tableau d'erreurs d'express-validator
      if (json.errors && Array.isArray(json.errors)) {
        const messages = json.errors.map(err => err.msg).join(" | ");
        throw new Error(messages);
      }
      // Sinon, on cherche le message classique
      throw new Error(json.message || "Connexion échouée");
    }

    const accessToken = json.accessToken || json.tokens?.accessToken;
    const currentUser = json.user;

    if (!accessToken) {
      throw new Error("Token absent dans la réponse serveur");
    }

    if (
      !currentUser ||
      currentUser.role !== "etudiant"
    ) {
      throw new Error("Cet utilisateur n'est pas enregistré comme étudiant");
    }

    // ajout des infos complémentaires
    currentUser.matiere = matiere;
    currentUser.niveau = niveau;

    localStorage.setItem("token", accessToken);
    localStorage.setItem("refreshToken", json.refreshToken || "");
    localStorage.setItem("currentUser", JSON.stringify(currentUser));

    showSuccess("Connexion réussie ! Redirection...");

    setTimeout(() => {
      window.location.replace("dashboard.html");
    }, 1000);

  } catch (err) {
    console.error("❌ Erreur:", err);

    const msg =
      err.message === "Failed to fetch"
        ? "Le serveur est injoignable. Réveillez-le en rafraîchissant la page."
        : err.message;

    showError(msg);
  } finally {
    showLoading(false);
  }
}

  function showError(msg) {
    if (errorDiv) {
      errorDiv.textContent = "❌ " + msg;
      errorDiv.style.display = "block";
    }
  }

  function hideError() { 
    if (errorDiv) errorDiv.style.display = "none"; 
  }

  function showSuccess(msg) {
    if (successDiv) {
      successDiv.textContent = "✅ " + msg;
      successDiv.style.display = "block";
    }
  }

  function hideSuccess() { 
    if (successDiv) successDiv.style.display = "none"; 
  }

  function showLoading(isLoading) {
    if (loadingDiv) {
      loadingDiv.textContent = isLoading ? "⏳ Connexion en cours..." : "";
      loadingDiv.style.display = isLoading ? "block" : "none";
    }
    if (submitBtn) submitBtn.disabled = isLoading;
  }

  loginForm.addEventListener("submit", loginEtudiant);

  ["username", "password", "matiere", "niveau"].forEach(id => {
    document.getElementById(id)?.addEventListener("focus", hideError);
    document.getElementById(id)?.addEventListener("change", hideError);
  });
});