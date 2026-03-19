document.addEventListener("DOMContentLoaded", () => {

  const form = document.getElementById("registerForm");
  const errorDiv = document.getElementById("errorDiv");
  const successDiv = document.getElementById("successDiv");

  const API_BASE = "http://localhost:4000/api/v1/auth";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username").value.trim();
    const prenom = document.getElementById("prenom").value.trim();
    const nom = document.getElementById("nom").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    try {
      const res = await fetch(`${API_BASE}/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username, prenom, nom, email, password })
});


      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.message || "Erreur lors de l'inscription");
      }

      successDiv.textContent = "Inscription réussie ! Redirection...";
      successDiv.classList.add("show");

      setTimeout(() => {
        window.location.href = "login.html";
      }, 1200);

    } catch (err) {
      errorDiv.textContent = "❌ " + err.message;
      errorDiv.classList.add("show");
    }
  });
});
