/**
 * =====================================================
 * LOGIN.JS â€“ Plateforme Scolaire (Frontend)
 * Version senior, sÃ©curisÃ©e et compatible backend
 * RÃ´les : eleve | etudiant | prof
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
     UI â€“ Affichage conditionnel du champ Sujet
  ===================================================== */
  function updateSujetVisibility(role) {
    if (["eleve", "etudiant"].includes(role)) {
      sujetFormContainer.style.display = "block";
    } else {
      sujetFormContainer.style.display = "none";
      if (sujetInput) sujetInput.value = "";
    }
  }

  // On ne montre le champ Sujet que aprÃ¨s le login
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
        showError("RÃ´le utilisateur non reconnu.");
    }
  }

  /* =====================================================
     LOGIN â€“ Fonction principale
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
      // ðŸ” Appel backend
      const data = await login(username, password);
      // ðŸ” DEBUG : ce que le backend renvoie rÃ©ellement 
      console.log("ðŸ” DATA REÃ‡UE DU BACKEND :", data); 
      console.log("ðŸ” ROLE EXACT REÃ‡U :", data.role);

      const backendRole = (data.user?.role || "").toLowerCase();

      // âš ï¸ VÃ©rification du rÃ´le cÃ´tÃ© backend
      if (!["prof", "eleve", "etudiant"].includes(backendRole)) {
        showError("RÃ´le utilisateur non reconnu cÃ´tÃ© serveur.");
        return;
      }

      // ðŸ‘¤ CrÃ©ation objet utilisateur
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

      // ðŸ’¾ Stockage local
      saveUserToStorage(user);

      // ðŸš€ Affiche le champ Sujet si nÃ©cessaire (optionnel)
      updateSujetVisibility(backendRole);

      // ðŸš€ Redirection intelligente
      redirectByRole(backendRole);

    } catch (err) {
      console.error("âŒ LOGIN ERROR:", err);
      showError("Nom d'utilisateur ou mot de passe incorrect.");
    }
  });

});

