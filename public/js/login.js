/**
 * =====================================================
 * LOGIN.JS – Plateforme Scolaire (Frontend)
 * Version senior, sécurisée et compatible backend
 * Rôles : eleve | etudiant | prof
 * =====================================================
 */

document.addEventListener("DOMContentLoaded", () => {

  /* =====================================================
     CONFIGURATION
  ===================================================== */
  const API_BASE = "/api/v1/auth";

  /* =====================================================
     DOM ELEMENTS
  ===================================================== */
  const form = document.getElementById("loginForm");
  const errorMsg = document.getElementById("errorMsg");
  const usernameInput = document.getElementById("usernameInput");
  const passwordInput = document.getElementById("passwordInput");
  const sujetInput = document.getElementById("sujetInput");
  const matiereInput = document.getElementById("matiereInput");
  const sujetFormContainer = document.getElementById("sujetFormContainer");

  /* =====================================================
     UI – Affichage conditionnel du champ Sujet
  ===================================================== */
  function updateSujetVisibility(role) {
    if (["eleve", "etudiant"].includes(role)) {
      sujetFormContainer.style.display = "block";
    } else {
      sujetFormContainer.style.display = "none";
      if (sujetInput) sujetInput.value = "";
    }
  }

  // On ne montre le champ Sujet que après le login
  sujetFormContainer.style.display = "none";

  /* =====================================================
     HELPERS
  ===================================================== */
  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.style.display = "block";
  }

  function clearError() {
    errorMsg.textContent = "";
    errorMsg.style.display = "none";
  }

  function saveUserToStorage(user) {
    localStorage.setItem("user", JSON.stringify(user));
  }

  function redirectByRole(role) {
    switch (role.toLowerCase()) {
      case "prof":
        window.location.href = "/dashboard.html";
        break;
      case "eleve":
      case "etudiant":
        window.location.href = "/dashboard.html";
        break;
      default:
        showError("Rôle utilisateur non reconnu.");
    }
  }

  /* =====================================================
     LOGIN – Fonction principale
  ===================================================== */
  async function login(username, password) {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });

    if (!res.ok) throw new Error("Identifiants invalides");

    return res.json();
  }

  /* =====================================================
     FORM SUBMIT
  ===================================================== */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      showError("Merci de remplir tous les champs.");
      return;
    }

    try {
      // 🔐 Appel backend
      const data = await login(username, password);
      // 🔍 DEBUG : ce que le backend renvoie réellement 
      console.log("🔍 DATA REÇUE DU BACKEND :", data); 
      console.log("🔍 ROLE EXACT REÇU :", data.role);

      const backendRole = (data.user?.role || "").toLowerCase();

      // ⚠️ Vérification du rôle côté backend
      if (!["prof", "eleve", "etudiant"].includes(backendRole)) {
        showError("Rôle utilisateur non reconnu côté serveur.");
        return;
      }

      // 👤 Création objet utilisateur
      const user = {
        id: data.id,
        role: backendRole,
        username: data.username,
        prenom: data.prenom,
        nom: data.nom,
        email: data.email,
        ville: data.ville || "-",
        pays: data.pays || "-",
        matiere: matiereInput?.value || null,
        sujet: ["eleve", "etudiant"].includes(backendRole)
          ? sujetInput?.value || ""
          : null,
        loggedAt: new Date().toISOString()
      };

      // 💾 Stockage local
      saveUserToStorage(user);

      // 🚀 Affiche le champ Sujet si nécessaire (optionnel)
      updateSujetVisibility(backendRole);

      // 🚀 Redirection intelligente
      redirectByRole(backendRole);

    } catch (err) {
      console.error("❌ LOGIN ERROR:", err);
      showError("Nom d'utilisateur ou mot de passe incorrect.");
    }
  });

});
