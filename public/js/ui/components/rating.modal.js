// ======================================================
// RATING MODAL — Notation de session
// ======================================================
import { AppState } from "/js/core/state.js";
let currentRatingProfId = null;
let currentRatingValue  = 0;
let ratingVisible = false;

const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:4000"
  : "";
// ======================================================
// CHARGEMENT NOTE PROFESSEUR
// ======================================================

export async function loadProfessorRating(profId) {

  const token = localStorage.getItem("token");

  try {

    const res = await fetch(
      `${API_URL}/api/v1/ratings/prof/${profId}`,
      {
        headers:{
          "Authorization": `Bearer ${token}`
        }
      }
    );

    if (!res.ok) {
      console.error("Erreur chargement rating");
      return;
    }

    const data = await res.json();

    console.log("⭐ Rating professeur:", JSON.stringify(data));

    const display = document.getElementById(`prof-rating-${profId}`);

    if (!display) return;

    display.innerHTML = `
    <div class="stars-display">
        ${"★".repeat(Math.round(Number(data.stats?.note_moyenne ?? 0)))}
    </div>
    <div>
        ${data.stats?.note_moyenne ?? "—"}/5
        (${data.stats?.total_avis ?? 0} avis)
    </div>
`;


  } catch(err){
    console.error(err);
  }
}

// ======================================================
// INIT — charge le fragment HTML puis bind les events
// ======================================================

export async function initRatingModal() {
  if (document.getElementById("rating-modal")) {
    console.warn("⚠️ Rating modal déjà chargée");
    return;
  }
  try {
    const res  = await fetch("/pages/eleve/rating.modal.html");
    const html = await res.text();
    document.body.insertAdjacentHTML("beforeend", html);
    bindRatingUI();
    console.log("✅ Rating modal initialisée");
  } catch (err) {
    console.error("❌ Erreur chargement rating.modal.html:", err);
  }
}

// ======================================================
// OPEN
// ======================================================

export function openRatingModal(profName, profId) {

  if (!profId) {
    console.warn(
      "⚠️ Impossible d'ouvrir notation sans profId"
    );
    return;
  }


  // 🔒 Empêche prof + élève d'ouvrir deux fois
  if (ratingVisible) {

    console.warn(
      "⚠️ Modal notation déjà visible"
    );

    return;
  }


  ratingVisible = true;


  currentRatingProfId = profId;
  currentRatingValue  = 0;


  const modal = document.getElementById("rating-modal");
  const profNameEl = document.getElementById("rating-prof-name");


  if (!modal) {

    ratingVisible = false;

    console.warn(
      "⚠️ rating-modal introuvable"
    );

    return;
  }


  if (profNameEl) {

    profNameEl.textContent = profName
      ? `avec ${profName}`
      : "avec votre professeur";

  }


  // Reset étoiles
  document
    .querySelectorAll("#rating-stars span")
    .forEach(s =>
      s.classList.remove("active")
    );


  // Reset commentaire
  const comment =
    document.getElementById("rating-comment");

  if (comment) {
    comment.value = "";
  }


  modal.style.display = "flex";


  console.log(
    "⭐ Modal notation ouverte pour prof:",
    profId
  );
}
// ======================================================
// CLOSE
// ======================================================

export function closeRatingModal() {

  const modal =
    document.getElementById("rating-modal");


  if (modal) {
    modal.style.display = "none";
  }
// 🆕 Reset message d'erreur
  const errorEl = document.getElementById("rating-error");
  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }

  currentRatingProfId = null;
  currentRatingValue  = 0;

  // 🔓 Autorise une prochaine session
  ratingVisible = false;


  console.log(
    "⭐ Modal notation fermée"
  );
}

// ======================================================
// SUBMIT
// ======================================================

async function _submitRating() {

  if (!currentRatingValue) {

    // Signaler visuellement que l'élève doit choisir une note
    document.querySelectorAll("#rating-stars span").forEach(s => {

      s.style.animation = "pulse-dot 0.4s ease";

      setTimeout(() => {
        s.style.animation = "";
      }, 400);

    });

    return;
  }


  const comment =
    document.getElementById("rating-comment")
      ?.value
      ?.trim() || "";


  const token = localStorage.getItem("token");
  const errorEl = document.getElementById("rating-error");

  // 🆕 Reset erreur avant chaque tentative
  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }
  try {
    const res = await fetch(
      `${API_URL}/api/v1/ratings`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },


        body: JSON.stringify({

          profId: currentRatingProfId,

          rating: currentRatingValue,

          comment,

         eleveId: AppState.currentUser?.id
        })

      }
    );


    if (!res.ok) {

      console.error("❌ Erreur API notation:", res.status);
        // 🆕 Message différencié selon le code
      if (errorEl) {
        errorEl.textContent =
          res.status === 401
            ? "Session expirée, veuillez recharger la page."
            : "Une erreur est survenue, veuillez réessayer.";
        errorEl.style.display = "block";
      }

      return;
    }


    console.log(
      "✅ Notation envoyée"
    );


    closeRatingModal();


  } catch (err) {


    console.error(
      "❌ Erreur réseau notation:",
      err
    );
     // 🆕 Erreur réseau (pas de réponse du tout)
    if (errorEl) {
      errorEl.textContent = "Impossible de joindre le serveur. Vérifiez votre connexion.";
      errorEl.style.display = "block";
    }
  }
 }
 
// ======================================================
// BIND EVENTS (appelé une seule fois après injection HTML)
// ======================================================

export function bindRatingUI() {
  // Étoiles
  document.querySelectorAll("#rating-stars span").forEach(star => {
    star.addEventListener("click", () => {
      currentRatingValue = parseInt(star.dataset.value);
      document.querySelectorAll("#rating-stars span").forEach(s => {
        s.classList.toggle(
          "active",
          parseInt(s.dataset.value) <= currentRatingValue
        );
      });
    });

    // Hover preview
    star.addEventListener("mouseenter", () => {
      const val = parseInt(star.dataset.value);
      document.querySelectorAll("#rating-stars span").forEach(s => {
        s.classList.toggle("active", parseInt(s.dataset.value) <= val);
      });
    });

    star.addEventListener("mouseleave", () => {
      document.querySelectorAll("#rating-stars span").forEach(s => {
        s.classList.toggle(
          "active",
          parseInt(s.dataset.value) <= currentRatingValue
        );
      });
    });
  });

  // Bouton Passer
  document.getElementById("rating-skip")
    ?.addEventListener("click", closeRatingModal);

  // Bouton Envoyer
  document.getElementById("rating-submit")
    ?.addEventListener("click", _submitRating);

  // Clic en dehors de la boîte → fermer
  document.getElementById("rating-modal")
    ?.addEventListener("click", (e) => {
      if (e.target.id === "rating-modal") closeRatingModal();
    });
}
