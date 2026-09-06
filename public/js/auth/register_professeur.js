const form = document.getElementById("registerForm");
const errorDiv = document.getElementById("errorDiv");
const successDiv = document.getElementById("successDiv");
const submitBtn = document.getElementById("submitBtn");

// 💡 Détection dynamique de l'URL de base (Local vs Production)
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "";

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset affichage
    if (errorDiv) { errorDiv.style.display = "none"; errorDiv.classList.remove("show"); }
    if (successDiv) { successDiv.style.display = "none"; successDiv.classList.remove("show"); }

    // ✅ NOUVEAU — vérification de la confirmation du mot de passe,
    // avant toute construction de FormData ou appel réseau.
    const password = form.password.value.trim();
    const passwordConfirm = form.passwordConfirm.value.trim();

    if (password !== passwordConfirm) {
      if (errorDiv) {
        errorDiv.textContent = "❌ Les mots de passe ne correspondent pas.";
        errorDiv.style.display = "block";
        errorDiv.classList.add("show");
      }
      return;
    }

    if (password.length < 6) {
      if (errorDiv) {
        errorDiv.textContent = "❌ Le mot de passe doit contenir au moins 6 caractères.";
        errorDiv.style.display = "block";
        errorDiv.classList.add("show");
      }
      return;
    }

    // Utilisation de FormData pour gérer les fichiers (Diplômes, etc.)
    const formData = new FormData(form);
    formData.delete("passwordConfirm"); // ✅ ne jamais envoyer ce champ au serveur

    submitBtn.disabled = true;
    submitBtn.textContent = "🔧 Envoi de votre dossier...";

    try {
      // 💡 Appel API dynamique
      const res = await fetch(`${API_URL}/api/v1/auth/signup-prof`, {
        method: "POST",
        body: formData // Note: Pas de headers Content-Type ici, le navigateur gère le multipart
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Erreur lors de l'inscription");
      }

      // ✔ Message de succès spécifique aux profs (Validation Admin)
      successDiv.innerHTML = `
        ✔ <strong>Demande envoyée avec succès !</strong><br><br>
        🔍 Votre dossier est en cours d'examen. Votre compte sera activé après validation par un administrateur.<br>
        📧 Vous recevrez un mail de confirmation.<br><br>
        🔁 Redirection vers la page de connexion...
      `;
      successDiv.style.display = "block";
      successDiv.classList.add("show");

      form.reset();

      // 💡 Redirection vers login professeur
      setTimeout(() => {
        window.location.replace("login.html");
      }, 4000);

    } catch (err) {
     console.error("❌ PROF SIGNUP ERROR:", err);
      const msg = err.message === "Failed to fetch" 
        ? "Impossible de contacter le serveur (Délai dépassé)."
        : err.message;
      
      if (errorDiv) {
        errorDiv.textContent = "❌ " + msg;
        errorDiv.style.display = "block";
        errorDiv.classList.add("show");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "📤 Envoyer ma demande";
    }
  });
}
