// ======================================================
// STRIPE SERVICE
// ======================================================

// ✅ Gestion retour Setup Intent (élève)
// ✅ Fonction de dispatch unique pour éviter les mélanges
export function handleAllStripeReturns() {
  const params = new URLSearchParams(window.location.search);
  const stripeStatus = params.get("stripe");
  
 if (!stripeStatus) return;

  // ⚠️ CORRECTION ICI : Utilise "currentUser" pour correspondre à ton login
  const storedUser = localStorage.getItem("currentUser");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.role;

  // Debug pour voir si le rôle est bien détecté
  console.log("Retour Stripe détecté - Rôle:", role, "Statut:", stripeStatus);
  if (role === 'eleve') {
    handleEleveReturn(stripeStatus);
  } else if (role === 'prof') {
    handleProfReturn(stripeStatus);
  }

  // Nettoyage de l'URL
  window.history.replaceState({}, "", window.location.pathname);
}

// Sous-fonction pour l'élève
function handleEleveReturn(status) {
  const stripeContainer = document.getElementById("stripe-status");
  if (status === "success") {
    if (stripeContainer) stripeContainer.innerHTML = `<span class="status-ok">✅ Carte enregistrée !</span>`;
  } else if (status === "cancel") {
    if (stripeContainer) stripeContainer.innerHTML = `<span class="status-warn">⚠️ Annulé.</span>`;
  }
}

// Sous-fonction pour le prof
function handleProfReturn(status) {
  if (status === "success") {
    alert("✅ Compte Stripe configuré !");
  } else if (status === "refresh") {
    alert("⚠️ Onboarding incomplet.");
  }
}
export async function initStripeOnboarding() {
  const token = localStorage.getItem("token");

  if (!token) {
    alert("Session expirée. Veuillez vous reconnecter.");
    window.location.href = "/login.html";
    return;
  }

  const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:4000"
    : "https://plateforme-scolaire-1.onrender.com";

  try {
    console.log("🚀 Lancement onboarding Stripe Connect...");

    const res = await fetch(`${API_URL}/api/v1/stripeConnect/create-account-link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("❌ Erreur Stripe onboarding :", data);
      alert(data.message || "Erreur lors de l'onboarding Stripe.");
      return;
    }

    if (data.url) {
      window.location.href = data.url;
    } else {
      throw new Error("URL Stripe manquante.");
    }

  } catch (err) {
    console.error("❌ Erreur réseau :", err);
    alert("Impossible de lancer Stripe.");
  }
}
// ✅ Ouverture session Setup Intent (élève)
export async function openSetupSession() {
  console.log("🚀 openSetupSession appelée");
  const token = localStorage.getItem("token");

  // 1. Vérification de sécurité locale
  if (!token) {
    alert("Votre session a expiré. Veuillez vous reconnecter.");
    window.location.href = "/login.html";
    return;
  }

  // 2. Utilisation de l'URL dynamique (indispensable pour Render/Local)
  const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:4000" 
    : "https://plateforme-scolaire-1.onrender.com";
    console.log("🌐 URL =", `${API_URL}/api/v1/stripeConnect/create-setup-session`);
  try {
    console.log("💳 Tentative d'ouverture de session Stripe...");

    const res = await fetch(`${API_URL}/api/v1/stripeConnect/create-setup-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`, // C'est ici que l'identité est transmise
      },
    });

    
    console.log("📡 Status HTTP :", res.status);
    console.log("📡 OK RESPONSE:", res.ok);
    const data = await res.json();
    console.log("📦 STRIPE RESPONSE:", data);
    if (!res.ok) {
      console.error("❌ Erreur Serveur Stripe :", data);
      alert(`Erreur : ${data.message || data.error || "Erreur inconnue Stripe."}`);
      return;
    }

    if (data.url) {
      console.log("➡️ Redirection vers Stripe...");
      window.location.href = data.url;
    } else {
      throw new Error("URL de redirection manquante dans la réponse.");
    }

  } catch (err) {
    console.error("❌ Erreur réseau Stripe :", err);
    alert("Impossible de contacter le service de paiement. Vérifiez votre connexion.");
  }
}
// ✅ Gestion retour onboarding Stripe (professeur)
export function handleProfStripeReturn() {
  const params = new URLSearchParams(window.location.search);
  const stripe = params.get("stripe");

  if (!stripe) return;

  if (stripe === "success") {
    alert("✅ Compte Stripe configuré avec succès !");
  } else if (stripe === "refresh") {
    alert("⚠️ Onboarding incomplet. Veuillez recommencer.");
  }

  window.history.replaceState({}, "", window.location.pathname);
}