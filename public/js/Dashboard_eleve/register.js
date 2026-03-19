document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const errorDiv = document.getElementById("errorDiv");
  const successDiv = document.getElementById("successDiv");
  const submitBtn = document.getElementById("submitBtn");

  if (!form || !errorDiv || !successDiv || !submitBtn) return;

  const fields = {
    username: document.getElementById("username"),
    prenom: document.getElementById("prenom"),
    nom: document.getElementById("nom"),
    email: document.getElementById("email"),
    telephone: document.getElementById("telephone"),
    ville: document.getElementById("ville"), 
    pays: document.getElementById("pays"),
    password: document.getElementById("password")
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    errorDiv.classList.remove("show");
    successDiv.classList.remove("show");
    errorDiv.textContent = "";
    successDiv.textContent = "";

    const data = {
      username: fields.username.value.trim(),
      prenom: fields.prenom.value.trim(),
      nom: fields.nom.value.trim(),
      email: fields.email.value.trim(),
      telephone: fields.telephone.value.trim(),
      ville: fields.ville.value.trim(),
      pays: fields.pays.value.trim(),
      password: fields.password.value,
      role: "eleve"
    };

    if (!data.username || !data.prenom || !data.nom || !data.email || !data.password) {
      errorDiv.textContent = "❌ Veuillez remplir tous les champs obligatoires";
      errorDiv.classList.add("show");
      return;
    }

    if (data.password.length < 6) {
      errorDiv.textContent = "❌ Mot de passe trop court (6 caractères min)";
      errorDiv.classList.add("show");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "⏳ Inscription...";

    try {
      const res = await fetch("http://localhost:4000/api/v1/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });

      const json = await res.json();

      if (!res.ok || json.success !== true) {
        throw new Error(json.message || "Erreur inscription");
      }

      successDiv.textContent = "✅ Inscription réussie ! Redirection...";
      successDiv.classList.add("show");

      setTimeout(() => {
        window.location.href = "login_eleve.html";
      }, 1500);

    } catch (err) {
      errorDiv.textContent = "❌ " + err.message;
      errorDiv.classList.add("show");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "S'inscrire";
    }
  });
});
