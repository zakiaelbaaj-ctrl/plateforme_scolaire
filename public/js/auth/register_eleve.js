const form = document.getElementById("registerForm");
const errorDiv = document.getElementById("errorDiv");
const successDiv = document.getElementById("successDiv");
const submitBtn = document.getElementById("submitBtn");

// 🔹 Détection dynamique de l'URL de base (Local vs Production)
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

// Redirection login
const loginLink = document.getElementById('loginLink');
if (loginLink) {
  loginLink.addEventListener('click', () => {
    window.location.href = '/pages/eleve/login.html';
  });
}

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    // Reset affichage
    if(errorDiv) { errorDiv.style.display = "none"; errorDiv.classList.remove("show"); }
    if(successDiv) { successDiv.style.display = "none"; successDiv.classList.remove("show"); }

    const data = {
      username: form.username.value.trim(),
      prenom: form.prenom.value.trim(),
      nom: form.nom.value.trim(),
      email: form.email.value.trim(),
      telephone: form.telephone.value.trim(),
      pays: form.pays.value.trim(),
      password: form.password.value.trim(),
    };

    // Validation basique
    if (!data.username || !data.email || !data.password) {
      showError("Veuillez remplir les champs obligatoires (Username, Email, Mot de passe)");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ Envoi...";

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/signup-eleve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Erreur lors de l'inscription");
      }

      successDiv.innerHTML = `
        ✅ <strong>Inscription réussie !</strong><br>
        🔐 Vous pouvez maintenant vous connecter.<br>
        ⏩ Redirection vers la page de connexion...
      `;
      successDiv.style.display = "block";
      successDiv.classList.add("show");

      form.reset();

      setTimeout(() => {
        window.location.href = '/pages/eleve/login.html';
      }, 2500);

    } catch (err) {
      console.error("❌ SIGNUP ERROR:", err);
      const msg = err.message === "Failed to fetch" 
        ? "Impossible de contacter le serveur." 
        : err.message;
      showError(msg);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "S'inscrire";
    }
  });
}

/**
 * Utilitaire pour afficher les erreurs
 */
function showError(msg) {
  if (errorDiv) {
    errorDiv.textContent = "❌ " + msg;
    errorDiv.style.display = "block";
    errorDiv.classList.add("show");
  }
}
