document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("registerForm");
  const errorDiv = document.getElementById("errorDiv");
  const successDiv = document.getElementById("successDiv");

  // ðŸ”¹ DÃ©tection dynamique de l'URL (Local vs Production)
  const API_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:4000" 
    : "https://plateforme-scolaire-1.onrender.com";

  const API_BASE = `${API_URL}/api/v1/auth`;

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    // Reset des messages
    if (errorDiv) { errorDiv.style.display = "none"; errorDiv.classList.remove("show"); }
    if (successDiv) { successDiv.style.display = "none"; successDiv.classList.remove("show"); }

    const username = document.getElementById("username")?.value.trim();
    const prenom = document.getElementById("prenom")?.value.trim();
    const nom = document.getElementById("nom")?.value.trim();
    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value.trim();

    // Validation basique avant envoi
    if (!username || !email || !password) {
      showError("Veuillez remplir les champs obligatoires.");
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, prenom, nom, email, password, role: "etudiant" })
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Erreur lors de l'inscription");
      }

      if (successDiv) {
        successDiv.textContent = "âœ… Inscription rÃ©ussie ! Redirection...";
        successDiv.style.display = "block";
        successDiv.classList.add("show");
      }

      form.reset();

      setTimeout(() => {
        window.location.href = "login.html";
      }, 1500);

    } catch (err) {
      console.error("âŒ REGISTER ERROR:", err);
      const msg = err.message === "Failed to fetch" 
        ? "Le serveur est inaccessible." 
        : err.message;
      showError(msg);
    }
  });

  function showError(msg) {
    if (errorDiv) {
      errorDiv.textContent = "âŒ " + msg;
      errorDiv.style.display = "block";
      errorDiv.classList.add("show");
    }
  }
});

