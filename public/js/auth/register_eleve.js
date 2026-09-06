const form = document.getElementById("registerForm");
const errorDiv = document.getElementById("errorDiv");
const successDiv = document.getElementById("successDiv");
const submitBtn = document.getElementById("submitBtn");

// 💡 Détection dynamique de l'URL de base (Local vs Production)
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "";

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
    const passwordConfirm = form.passwordConfirm.value.trim();

    // Validation basique
    if (!data.username || !data.email || !data.password) {
      showError("Veuillez remplir les champs obligatoires (Username, Email, Mot de passe)");
      return;
    }

    // ✅ NOUVEAU — vérification de la confirmation du mot de passe
    if (data.password !== passwordConfirm) {
      showError("Les mots de passe ne correspondent pas.");
      return;
    }

    if (data.password.length < 6) {
      showError("Le mot de passe doit contenir au moins 6 caractères.");
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

      // ✅ Message insistant, basé sur la vraie réponse du serveur,
      // sans redirection automatique — l'élève doit lire et agir lui-même.
      successDiv.innerHTML = `
        <div style="text-align:center;">
          <div style="font-size:2.5rem; margin-bottom:8px;">📧</div>
          <strong style="font-size:1.05rem;">Inscription réussie !</strong><br><br>
          ${result.message || "Vérifiez votre boîte mail pour activer votre compte."}<br><br>
          <span style="opacity:0.8; font-size:0.85em;">
            Pensez à vérifier votre dossier <strong>spam / courrier indésirable</strong>
            si vous ne trouvez pas l'email.
          </span>
        </div>
      `;
      successDiv.style.display = "block";
      successDiv.classList.add("show");
      form.reset();

      // ✅ Le formulaire disparaît pour éviter une nouvelle soumission,
      // mais on n'impose plus de redirection automatique — c'est l'élève
      // qui clique sur "Aller à la connexion" une fois prêt.
      form.style.display = "none";

      const goToLoginBtn = document.createElement("button");
      goToLoginBtn.textContent = "Aller à la page de connexion";
      goToLoginBtn.type = "button";
      goToLoginBtn.style.cssText = `
        margin-top: 16px;
        width: 100%;
        padding: 12px 20px;
        border: none;
        border-radius: 8px;
        background: #2563eb;
        color: #fff;
        font-size: 0.95rem;
        font-weight: 600;
        cursor: pointer;
      `;
      goToLoginBtn.addEventListener("mouseenter", () => {
        goToLoginBtn.style.filter = "brightness(1.1)";
      });
      goToLoginBtn.addEventListener("mouseleave", () => {
        goToLoginBtn.style.filter = "none";
      });
      goToLoginBtn.addEventListener("click", () => {
        window.location.href = '/pages/eleve/login.html';
      });
      successDiv.appendChild(goToLoginBtn);

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

