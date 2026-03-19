const form = document.getElementById("registerForm");
const errorDiv = document.getElementById("errorDiv");
const successDiv = document.getElementById("successDiv");
const submitBtn = document.getElementById("submitBtn");

// Redirection login
document.getElementById('loginLink').addEventListener('click', () => {
  window.location.href = '/pages/eleve/login.html';
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorDiv.classList.remove("show");
  successDiv.classList.remove("show");

  const data = {
    username: form.username.value.trim(),
    prenom: form.prenom.value.trim(),
    nom: form.nom.value.trim(),
    email: form.email.value.trim(),
    telephone: form.telephone.value.trim(),
    pays: form.pays.value.trim(),
    password: form.password.value.trim(),
  };

  submitBtn.disabled = true;
  submitBtn.textContent = "⏳ Envoi...";

  try {
    const res = await fetch("http://localhost:4000/api/v1/auth/signup-eleve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error("Erreur lors de l'inscription");

    successDiv.innerHTML = `
      ✅ <strong>Inscription réussie !</strong><br>
      🔐 Vous pouvez maintenant vous connecter.<br>
      ⏩ Redirection vers la page de connexion...
    `;
    successDiv.classList.add("show");

    form.reset();

    setTimeout(() => {
      window.location.href = '/pages/eleve/login.html';
    }, 2500);

  } catch (err) {
    errorDiv.textContent = "❌ " + err.message;
    errorDiv.classList.add("show");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "S'inscrire";
  }
});
