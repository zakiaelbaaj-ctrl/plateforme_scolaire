// ============================================
// 🔐 LOGIN ELEVE
// ============================================

// 🔹 Vérifier si l'élève est déjà connecté
const existingToken = localStorage.getItem("token");

if (existingToken) {
  // ✅ Déjà connecté → aller directement au dashboard
  window.location.replace("../../pages/eleve/dashboard.html");
}

// 🔹 Nettoyer les anciens tokens (sécurité)
localStorage.removeItem("token");
localStorage.removeItem("refreshToken");

document.addEventListener("DOMContentLoaded", () => {

  const loginForm = document.getElementById("loginEleveForm");
  const errorDiv = document.getElementById("errorDiv");
  const registerLink = document.getElementById("registerLink"); // bouton optionnel

  // 🔸 Vérifier que le formulaire existe
  if (!loginForm) return;

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username")?.value.trim();
    const password = document.getElementById("password")?.value.trim();
    const matiere = document.getElementById("matiere")?.value;
    const niveau = document.getElementById("niveau")?.value;

    if (!username || !password) {
      errorDiv.textContent = "Veuillez remplir tous les champs.";
      return;
    }

    errorDiv.textContent = "";

    try {
      const response = await fetch("http://localhost:4000/api/v1/auth/login", {
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

      const data = await response.json();
       console.log("Réponse serveur complète:", data); // ← ajouter cette ligne
      if (!response.ok) {
        throw new Error(data.message || "Échec de la connexion");
      }

      // ✅ Stockage sécurisé
      localStorage.setItem("token", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      localStorage.setItem("currentUser", JSON.stringify(data.user));

      // 🚀 Redirection vers dashboard élève
      window.location.replace("../../pages/eleve/dashboard.html");

    } catch (error) {
      console.error("❌ LOGIN ERROR:", error);
      errorDiv.textContent = error.message;
    }
  });

  // 🔹 Si bouton "S'inscrire" présent
  if (registerLink) {
    registerLink.addEventListener("click", () => {
      window.location.href = "../../pages/eleve/register.html";
    });
  }

});
