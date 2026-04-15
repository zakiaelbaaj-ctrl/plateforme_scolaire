// ============================================
// 🔐 LOGIN ELEVE
// ============================================

// 1️⃣ Vérifier si quelqu'un est déjà connecté
const existingToken = localStorage.getItem("token");
const currentUser = JSON.parse(localStorage.getItem("currentUser"));

if (existingToken && currentUser) {
    // ✅ Déjà connecté -> Rediriger selon le rôle stocké
    if (currentUser.role === "eleve") {
        window.location.replace("../../pages/eleve/dashboard.html");
    } else if (currentUser.role === "prof") {
        window.location.replace("../../pages/professeur/dashboard.html");
    }
    // Si on est redirigé, le reste du script s'arrête ici.
} else {
    // 2️⃣ Si PAS de token ou données corrompues -> On nettoie TOUT pour repartir à zéro
    // C'est ici que le nettoyage est utile
    localStorage.clear(); 
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
if (data.accessToken) {
    // 1. On stocke les jetons
    localStorage.setItem("token", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken || "");
    
    // 2. On stocke l'objet utilisateur complet (contient id, nom, rôle, etc.)
    localStorage.setItem("currentUser", JSON.stringify(data.user));
    
    // 3. On stocke le niveau (spécifique à l'élève)
    if (niveau) {
        localStorage.setItem("userLevel", niveau);
    }

    // 🚀 REDIRECTION DYNAMIQUE SELON LE RÔLE
    // On récupère le rôle directement depuis l'objet user renvoyé par le backend
    const userRole = data.user.role; 

    if (userRole === "eleve") {
        window.location.replace("../../pages/eleve/dashboard.html");
    } else if (userRole === "prof") {
        window.location.replace("../../pages/professeur/dashboard.html");
    } else {
        console.error("Rôle inconnu :", userRole);
        alert("Erreur de configuration de compte.");
    }

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