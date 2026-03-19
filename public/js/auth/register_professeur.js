const form = document.getElementById("registerForm");
const errorDiv = document.getElementById("errorDiv");
const successDiv = document.getElementById("successDiv");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  errorDiv.classList.remove("show");
  successDiv.classList.remove("show");

  const formData = new FormData(form);

  submitBtn.disabled = true;
  submitBtn.textContent = "⏳ Envoi...";

  try {
    const res = await fetch("http://localhost:4000/api/v1/auth/signup-prof", {
      method: "POST",
      body: formData // On envoie l'objet FormData directement
    });

    if (!res.ok) throw new Error("Erreur lors de l'inscription");

    successDiv.innerHTML = `
      ✅ <strong>Demande envoyée avec succès</strong><br><br>
      ⏳ Votre compte sera activé après validation par un administrateur.<br>
      🔐 Vous pourrez ensuite vous connecter.
      <br><br>
      ⏩ Redirection vers la page de connexion...
    `;
    successDiv.classList.add("show");

    form.reset();

    //* 🔁 Redirection vers login professeur */
    setTimeout(() => {
    window.location.replace("login.html");
    }, 3500);


  } catch (err) {
    errorDiv.textContent = "❌ " + err.message;
    errorDiv.classList.add("show");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "📤 Envoyer ma demande";
  }
});
