const form = document.getElementById("registerForm");
const errorDiv = document.getElementById("errorDiv");
const successDiv = document.getElementById("successDiv");
const submitBtn = document.getElementById("submitBtn");

// ðŸ”¹ DÃ©tection dynamique de l'URL de base (Local vs Production)
const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset affichage
    if (errorDiv) { errorDiv.style.display = "none"; errorDiv.classList.remove("show"); }
    if (successDiv) { successDiv.style.display = "none"; successDiv.classList.remove("show"); }

    // Utilisation de FormData pour gÃ©rer les fichiers (DiplÃ´mes, Photo, etc.)
    const formData = new FormData(form);

    submitBtn.disabled = true;
    submitBtn.textContent = "â³ Envoi de votre dossier...";

    try {
      // ðŸš€ Appel API dynamique
      const res = await fetch(`${API_URL}/api/v1/auth/signup-prof`, {
        method: "POST",
        body: formData // Note: Pas de headers Content-Type ici, le navigateur gÃ¨re le multipart
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.message || "Erreur lors de l'inscription");
      }

      // âœ… Message de succÃ¨s spÃ©cifique aux profs (Validation Admin)
      successDiv.innerHTML = `
        âœ… <strong>Demande envoyÃ©e avec succÃ¨s !</strong><br><br>
        â³ Votre dossier est en cours d'examen. Votre compte sera activÃ© aprÃ¨s validation par un administrateur.<br>
        ðŸ” Vous recevrez un mail de confirmation.<br><br>
        â© Redirection vers la page de connexion...
      `;
      successDiv.style.display = "block";
      successDiv.classList.add("show");

      form.reset();

      // ðŸ” Redirection vers login professeur
      setTimeout(() => {
        window.location.replace("login.html");
      }, 4000);

    } catch (err) {
      console.error("âŒ PROF SIGNUP ERROR:", err);
      const msg = err.message === "Failed to fetch" 
        ? "Impossible de contacter le serveur (DÃ©lai dÃ©passÃ©)." 
        : err.message;
      
      if (errorDiv) {
        errorDiv.textContent = "âŒ " + msg;
        errorDiv.style.display = "block";
        errorDiv.classList.add("show");
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "ðŸ“¤ Envoyer ma demande";
    }
  });
}

