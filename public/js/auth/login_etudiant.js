// ============================================
// ðŸ” LOGIN Ã‰TUDIANT
// ============================================

// ðŸ”¹ DÃ©tection dynamique de l'URL de base (Local vs Production)
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

const API_BASE = `${API_URL}/api/v1`;

// ðŸ”¹ VÃ©rifier si l'Ã©tudiant est dÃ©jÃ  connectÃ©
const existingToken = localStorage.getItem("token");
if (existingToken) {
  // âœ… DÃ©jÃ  connectÃ© â†’ aller directement au dashboard
  window.location.replace("/pages/etudiant/dashboard.html");
}

// ðŸ”¹ Nettoyer les anciens tokens (sÃ©curitÃ©)
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

  // ðŸ”— Bouton "S'inscrire" corrigÃ© (vers la page de crÃ©ation de compte)
  if (registerLink) {
    registerLink.addEventListener("click", () => {
      window.location.href = "/pages/etudiant/register.html";
    });
  }

  /**
   * Fonction de connexion Ã©tudiant
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

      console.log("ðŸ“¤ Connexion Ã©tudiant via:", `${API_BASE}/auth/login`);

      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const json = await res.json();
      console.log("ðŸ“¥ RÃ©ponse serveur:", json);

      if (!res.ok) throw new Error(json.message || "Connexion Ã©chouÃ©e");

      // VÃ©rification du chemin du token (certains serveurs renvoient json.accessToken ou json.tokens.accessToken)
      const accessToken = json.accessToken || json.tokens?.accessToken;
      const currentUser = json.user;

      if (!accessToken) throw new Error("Token absent dans la rÃ©ponse serveur");
      
      // SÃ©curitÃ© sur le rÃ´le
      if (!currentUser || (currentUser.role !== "etudiant" && currentUser.role !== "eleve")) {
         throw new Error("Cet utilisateur n'est pas enregistrÃ© comme Ã©tudiant");
      }

      // Enrichir utilisateur
      currentUser.matiere = matiere;
      currentUser.niveau = niveau;

      // Stockage local
      localStorage.setItem("token", accessToken);
      localStorage.setItem("refreshToken", json.refreshToken || "");
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      showSuccess("Connexion rÃ©ussie ! Redirection...");

      setTimeout(() => {
        window.location.replace("/pages/etudiant/dashboard.html");
      }, 1000);

    } catch (err) {
      console.error("âŒ Erreur:", err);
      const msg = err.message === "Failed to fetch" 
        ? "Le serveur est injoignable. RÃ©veillez-le en rafraÃ®chissant la page." 
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
      errorDiv.textContent = "âŒ " + msg;
      errorDiv.style.display = "block";
    }
  }

  function hideError() { 
    if (errorDiv) errorDiv.style.display = "none"; 
  }

  function showSuccess(msg) {
    if (successDiv) {
      successDiv.textContent = "âœ… " + msg;
      successDiv.style.display = "block";
    }
  }

  function hideSuccess() { 
    if (successDiv) successDiv.style.display = "none"; 
  }

  function showLoading(isLoading) {
    if (loadingDiv) {
      loadingDiv.textContent = isLoading ? "â³ Connexion en cours..." : "";
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

