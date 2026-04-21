// ======================================================
// STRIPE SERVICE
// ======================================================

// âœ… Gestion retour Setup Intent (Ã©lÃ¨ve)
// âœ… Fonction de dispatch unique pour Ã©viter les mÃ©langes
export function handleAllStripeReturns() {
  const params = new URLSearchParams(window.location.search);
  const stripeStatus = params.get("stripe");
  
 if (!stripeStatus) return;

  // âš ï¸ CORRECTION ICI : Utilise "currentUser" pour correspondre Ã  ton login
  const storedUser = localStorage.getItem("currentUser");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.role;

  // Debug pour voir si le rÃ´le est bien dÃ©tectÃ©
  console.log("Retour Stripe dÃ©tectÃ© - RÃ´le:", role, "Statut:", stripeStatus);
  if (role === 'eleve') {
    handleEleveReturn(stripeStatus);
  } else if (role === 'prof') {
    handleProfReturn(stripeStatus);
  }

  // Nettoyage de l'URL
  window.history.replaceState({}, "", window.location.pathname);
}

// Sous-fonction pour l'Ã©lÃ¨ve
function handleEleveReturn(status) {
  const stripeContainer = document.getElementById("stripe-status");
  if (status === "success") {
    if (stripeContainer) stripeContainer.innerHTML = `<span class="status-ok">âœ… Carte enregistrÃ©e !</span>`;
  } else if (status === "cancel") {
    if (stripeContainer) stripeContainer.innerHTML = `<span class="status-warn">âš ï¸ AnnulÃ©.</span>`;
  }
}

// Sous-fonction pour le prof
function handleProfReturn(status) {
  if (status === "success") {
    alert("âœ… Compte Stripe configurÃ© !");
  } else if (status === "refresh") {
    alert("âš ï¸ Onboarding incomplet.");
  }
}
export async function initStripeOnboarding() {
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expirÃ©e. Veuillez vous reconnecter.");
    window.location.href = "/login.html";
    return;
  }

  const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:4000"
    : "https://plateforme-scolaire-1.onrender.com";

  try {
    console.log("ðŸš€ Lancement onboarding Stripe Connect...");

    const res = await fetch(`${API_URL}/api/v1/stripeConnect/create-account-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("âŒ Erreur Stripe onboarding :", data);
      alert(data.message || "Erreur lors de l'onboarding Stripe.");
      return;
    }

    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error("URL Stripe manquante.");
    }

  } catch (err) {
    console.error("âŒ Erreur rÃ©seau :", err);
    alert("Impossible de lancer Stripe.");
  }
}
// âœ… Ouverture session Setup Intent (Ã©lÃ¨ve)
export async function openSetupSession() {
  console.log("ðŸš€ openSetupSession appelÃ©e");
  const token = localStorage.getItem("token");

  // 1. VÃ©rification de sÃ©curitÃ© locale
  if (!token) {
    alert("Votre session a expirÃ©. Veuillez vous reconnecter.");
    window.location.href = "/login.html";
    return;
  }

  // 2. Utilisation de l'URL dynamique (indispensable pour Render/Local)
  const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:4000" 
    : "https://plateforme-scolaire-1.onrender.com";
    console.log("ðŸŒ URL =", `${API_URL}/api/v1/stripeConnect/create-setup-session`);
  try {
    console.log("ðŸ’³ Tentative d'ouverture de session Stripe...");

    const res = await fetch(`${API_URL}/api/v1/stripeConnect/create-setup-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`, // C'est ici que l'identitÃ© est transmise
      },
    });

    
    console.log("ðŸ“¡ Status HTTP :", res.status);
    console.log("ðŸ“¡ OK RESPONSE:", res.ok);
    const data = await res.json();
    console.log("ðŸ“¦ STRIPE RESPONSE:", data);
    if (!res.ok) {
      console.error("âŒ Erreur Serveur Stripe :", data);
      alert(`Erreur : ${data.message || data.error || "Erreur inconnue Stripe."}`);
      return;
    }

    if (data.url) {
      console.log("âž¡ï¸ Redirection vers Stripe...");
      window.location.href = data.url;
    } else {
      throw new Error("URL de redirection manquante dans la rÃ©ponse.");
    }

  } catch (err) {
    console.error("âŒ Erreur rÃ©seau Stripe :", err);
    alert("Impossible de contacter le service de paiement. VÃ©rifiez votre connexion.");
  }
}
// âœ… Gestion retour onboarding Stripe (professeur)
export function handleProfStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const stripe = params.get("stripe");

  if (!stripe) return;

  if (stripe === "success") {
    alert("âœ… Compte Stripe configurÃ© avec succÃ¨s !");
  } else if (stripe === "refresh") {
    alert("âš ï¸ Onboarding incomplet. Veuillez recommencer.");
  }

  window.history.replaceState({}, "", window.location.pathname);
}

