// ============================================
// 🔐 LOGIN ÉTUDIANT
// ============================================

// 🔹 Détection dynamique de l'URL de base (Local vs Production)
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

const API_BASE = `${API_URL}/api/v1`;

// 🔹 Vérifier si l'étudiant est déjà connecté
const existingToken = localStorage.getItem("token");
if (existingToken) {
  // ✅ Déjà connecté → aller directement au dashboard
  window.location.replace("/pages/etudiant/dashboard.html");
}

// 🔹 Nettoyer les anciens tokens (sécurité)
localStorage.removeItem("token");
localStorage.removeItem("refreshToken");

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginEtudiantForm");
  const errorDiv = document.getElementById("errorDiv");
  const successDiv = document.getElementById("successDiv");
  const loadingDiv = document.getElementById("loadingDiv");
  const submitBtn = document.getElementById("submitBtn");
  const registerLink = document.getElementById("registerLink");

  if (!loginForm) return;

  // 🔗 Bouton "S'inscrire" corrigé (vers la page de création de compte)
  if (registerLink) {
    registerLink.addEventListener("click", () => {
      window.location.href = "/pages/etudiant/register.html";
    });
  }

  /**
   * Fonction de connexion étudiant
   */
  async function loginEtudiant(event) {
    event.preventDefault();

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

      console.log("📤 Connexion étudiant via:", `${API_BASE}/auth/login`);

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const json = await res.json();
      console.log("📥 Réponse serveur:", json);

      if (!res.ok) throw new Error(json.message || "Connexion échouée");

      // Vérification du chemin du token (certains serveurs renvoient json.accessToken ou json.tokens.accessToken)
      const accessToken = json.accessToken || json.tokens?.accessToken;
      const currentUser = json.user;

      if (!accessToken) throw new Error("Token absent dans la réponse serveur");
      
      // Sécurité sur le rôle
      if (!currentUser || (currentUser.role !== "etudiant" && currentUser.role !== "eleve")) {
         throw new Error("Cet utilisateur n'est pas enregistré comme étudiant");
      }

      // Enrichir utilisateur
      currentUser.matiere = matiere;
      currentUser.niveau = niveau;

      // Stockage local
      localStorage.setItem("token", accessToken);
      localStorage.setItem("refreshToken", json.refreshToken || "");
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      showSuccess("Connexion réussie ! Redirection...");

      setTimeout(() => {
        window.location.replace("/pages/etudiant/dashboard.html");
      }, 1000);

    } catch (err) {
      console.error("❌ Erreur:", err);
      const msg = err.message === "Failed to fetch" 
        ? "Le serveur est injoignable. Réveillez-le en rafraîchissant la page." 
        : err.message;
      showError(msg);
      showLoading(false);
    }
  }

  /**
   * Utilitaires d'affichage
   */
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

  // Bind formulaire
  loginForm.addEventListener("submit", loginEtudiant);

  // Nettoyage au focus
  ["username", "password", "matiere", "niveau"].forEach(id => {
    document.getElementById(id)?.addEventListener("focus", hideError);
    document.getElementById(id)?.addEventListener("change", hideError);
  });
});
