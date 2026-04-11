// ============================================
// 🔐 LOGIN ELEVE
// ============================================

// 🔹 Vérifier si l'élève est déjà connecté
const existingToken = localStorage.getItem("token");

if (existingToken) {
  // ✅ Déjà connecté → aller directement au dashboard
  window.location.replace("../../pages/eleve/dashboard.html");
}

// 🔹 Nettoyer les anciens tokens (sécurité au cas où on revient sur la page login)
// Note : On ne les supprime que si on n'est pas déjà redirigé au-dessus
if (!existingToken) {
  localStorage.removeItem("token");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("currentUser");
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginEleveForm");
  const errorDiv = document.getElementById("errorDiv");
  const registerLink = document.getElementById("registerLink");

  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username")?.value.trim();
    const password = document.getElementById("password")?.value.trim();
    const matiere = document.getElementById("matiere")?.value;
    const niveau = document.getElementById("niveau")?.value;
     
    // Vérification optionnelle : si l'élève choisit "Universitaire", 
// tu peux ajouter un log pour déboguer
    if (niveau === "universitaire") {
    console.log("🎓 Mode Universitaire détecté pour l'utilisateur");
   }
    if (!username || !password) {
      errorDiv.textContent = "Veuillez remplir tous les champs.";
      return;
    }

    errorDiv.textContent = "Connexion en cours..."; // Feedback visuel

    try {
      // 🔹 Détection dynamique de l'URL (Local vs Render)
      const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://localhost:4000" 
        : "https://plateforme-scolaire-1.onrender.com";

      const response = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password,
          matiere,
          niveau
        })
      });

      // 🔹 Gestion sécurisée du JSON
      const data = await response.json();
      console.log("Réponse serveur complète:", data);

      if (!response.ok) {
        throw new Error(data.message || "Échec de la connexion");
      }

      // ✅ Stockage sécurisé
      // Attention : vérifiez que votre backend renvoie bien data.accessToken et data.refreshToken
      if (data.accessToken) {
        localStorage.setItem("token", data.accessToken);
        localStorage.setItem("refreshToken", data.refreshToken || "");
        localStorage.setItem("currentUser", JSON.stringify(data.user));
        // 📍 AJOUTE LA LIGNE ICI :
        localStorage.setItem("userLevel", niveau);

        // 🚀 Redirection vers dashboard élève
        window.location.replace("../../pages/eleve/dashboard.html");
      } else {
        throw new Error("Erreur : Token non reçu du serveur.");
      }

    } catch (error) {
      console.error("❌ LOGIN ERROR:", error);
      // "Failed to fetch" devient un message plus clair pour l'utilisateur
      if (error.message === "Failed to fetch") {
        errorDiv.textContent = "Impossible de contacter le serveur. Vérifiez votre connexion ou l'URL de l'API.";
      } else {
        errorDiv.textContent = error.message;
      }
    }
  });

  if (registerLink) {
    registerLink.addEventListener("click", () => {
      window.location.href = "../../pages/eleve/register.html";
    });
  }
});