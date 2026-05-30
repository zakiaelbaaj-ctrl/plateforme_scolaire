/**
 * =====================================================
 * LOGIN.JS Ã¢â¬â Plateforme Scolaire (Frontend)
 * Version senior, sÃÂ©curisÃÂ©e et compatible backend
 * RÃÂ´les : eleve | etudiant | prof
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
     UI Ã¢â¬â Affichage conditionnel du champ Sujet
  ===================================================== */
  function updateSujetVisibility(role) {
    if (["eleve", "etudiant"].includes(role)) {
      sujetFormContainer.style.display = "block";
    } else {
      sujetFormContainer.style.display = "none";
      if (sujetInput) sujetInput.value = "";
    }
  }

  // On ne montre le champ Sujet que aprÃÂ¨s le login
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
        showError("RÃÂ´le utilisateur non reconnu.");
    }
  }

  /* =====================================================
     LOGIN Ã¢â¬â Fonction principale
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
      // Ã°Å¸âÂ Appel backend
      const data = await login(username, password);
      // Ã°Å¸âÂ DEBUG : ce que le backend renvoie rÃÂ©ellement 
      console.log("Ã°Å¸âÂ DATA REÃâ¡UE DU BACKEND :", data); 
      console.log("Ã°Å¸âÂ ROLE EXACT REÃâ¡U :", data.role);

      const backendRole = (data.user?.role || "").toLowerCase();

      // Ã¢Å¡Â Ã¯Â¸Â VÃÂ©rification du rÃÂ´le cÃÂ´tÃÂ© backend
      if (!["prof", "eleve", "etudiant"].includes(backendRole)) {
        showError("RÃÂ´le utilisateur non reconnu cÃÂ´tÃÂ© serveur.");
        return;
      }

      // Ã°Å¸âÂ¤ CrÃÂ©ation objet utilisateur
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

      // Ã°Å¸âÂ¾ Stockage local
      saveUserToStorage(user);

      // Ã°Å¸Å¡â¬ Affiche le champ Sujet si nÃÂ©cessaire (optionnel)
      updateSujetVisibility(backendRole);

      // Ã°Å¸Å¡â¬ Redirection intelligente
      redirectByRole(backendRole);

    } catch (err) {
      console.error("Ã¢ÂÅ LOGIN ERROR:", err);
      showError("Nom d'utilisateur ou mot de passe incorrect.");
    }
  });

});

