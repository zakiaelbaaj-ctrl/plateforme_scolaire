// ======================================================
// STRIPE SERVICESTRIPE SERVICE
// ======================================================

// ✅ Gestion retour Setup Intent (élève)
// ✅ Fonction de dispatch unique pour éviter les mélanges
export function handleAllStripeReturns() {
  const params = new URLSearchParams(window.location.search);
  const stripeStatus = params.get("stripe");
  
 if (!stripeStatus) return;

  // Récupérer le rôle de l'utilisateur pour dispatcher vers le bon handler
  const storedUser = localStorage.getItem("currentUser");
  const user = storedUser ? JSON.parse(storedUser) : null;
  const role = user?.role;

  // ✅ Debug pour voir si le rôle est bien détecté
console.log("Retour Stripe détecté - Rôle:", role, "Statut:", stripeStatus);

if (role === 'eleve' || role === 'etudiant') {
  // Élève ou étudiant → retour Stripe coté élève
  handleEleveReturn(stripeStatus);
} else if (role === 'prof') {
  // Professeur → retour Stripe coté prof
  handleProfReturn(stripeStatus);
}
  // Nettoyage de l'URL
  window.history.replaceState({}, "", window.location.pathname);
}

// Sous-fonction pour l'élève
function handleEleveReturn(status) {
  const stripeContainer = document.getElementById("stripe-status");
  if (status === "success") {
    if (stripeContainer) {
  stripeContainer.innerHTML = `<span class="status-ok">✅ Carte enregistrée !</span>`;
}

  } else if (status === "cancel") {
    if (stripeContainer) stripeContainer.innerHTML = `<span class="status-warn">❌ Annulée.</span>`;
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
    : "";

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
  console.log("✅ openSetupSession appelée");
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
    : "";
    
 console.log("✅ URL =", `${API_URL}/api/v1/stripeConnect/create-setup-session`);
  try {
    console.log("✅ Tentative d'ouverture de session Stripe...");

    const res = await fetch(`${API_URL}/api/v1/stripeConnect/create-setup-session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`, // C'est ici que l'identité est transmise
      },
    });

    console.log("✅ Status HTTP :", res.status);
    console.log("✅ OK RESPONSE:", res.ok);
    const data = await res.json();
    console.log("✅ STRIPE RESPONSE:", data);

    if (!res.ok) {
      console.error("❌ Erreur Serveur Stripe :", data);
      alert(`Erreur : ${data.message || data.error || "Erreur inconnue Stripe."}`);
      return;
    }

    if (data.url) {
      console.log("✅ Redirection vers Stripe...");
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

// ✅ Création de l'empreinte bancaire AVANT de rejoindre la salle (élève)
export async function holdFundsForSession(prixMaxEnCentimes) {
  const token = localStorage.getItem("token");
  if (!token) throw new Error("Session expirée.");
  // ✅ Vérification que c'est bien un élève
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  if (currentUser.role && currentUser.role !== "eleve") {
    throw new Error("Action réservée aux élèves.");
  }
  
  const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    ? "http://localhost:4000" 
    : "";

  try {
    console.log("✅ Demande d'empreinte bancaire en cours...");

    const res = await fetch(`${API_URL}/api/v1/stripeConnect/pre-auth`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ amount: prixMaxEnCentimes }) // Ex: 3000 pour 30€
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.message || "Fonds insuffisants ou carte refusée.");
    }

    console.log("✅ Empreinte validée. PaymentIntent ID:", data.paymentIntentId);
    
    // On retourne l'ID pour pouvoir le lier à la session WebSocket
    return data.paymentIntentId; 

  } catch (err) {
    console.error("❌ Erreur Empreinte Stripe :", err);
    alert(`Impossible de démarrer le cours : ${err.message}`);
    return null; // Bloque l'accès au cours
  }
}
