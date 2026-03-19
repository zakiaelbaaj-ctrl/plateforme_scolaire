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

  // 🔗 Bouton "S'inscrire"
  if (registerLink) {
    registerLink.addEventListener("click", () => {
     window.location.replace("/etudiant/dashboard");

    });
  }

  // 🌐 API
  const API_BASE = window.location.origin + "/api/v1";

  async function loginEtudiant(event) {
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

      const accessToken = json.tokens?.accessToken;
      const currentUser = json.user;

      if (!accessToken) throw new Error("Token absent dans la réponse serveur");
      if (!currentUser || currentUser.role !== "etudiant")
        throw new Error("Cet utilisateur n'est pas étudiant");

      currentUser.matiere = matiere;
      currentUser.niveau = niveau;

      localStorage.setItem("token", accessToken);
      localStorage.setItem("currentUser", JSON.stringify(currentUser));

      console.log("✅ Données stockées:", { token: "***", user: currentUser });

      showSuccess("Connexion réussie ! Redirection...");

      setTimeout(() => {
        window.location.replace("/pages/etudiant/dashboard.html");
      }, 1000);

    } catch (err) {
      console.error("❌ Erreur:", err);
      showError(err.message || "Erreur de connexion");
      showLoading(false);
    }
  }

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

  loginForm.addEventListener("submit", loginEtudiant);

  document.getElementById("username").addEventListener("focus", hideError);
  document.getElementById("password").addEventListener("focus", hideError);
  document.getElementById("matiere").addEventListener("change", hideError);
  document.getElementById("niveau").addEventListener("change", hideError);

});
