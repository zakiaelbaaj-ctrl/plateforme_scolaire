// ======================================================
// RATING MODAL — Notation de session
// ======================================================

let currentRatingProfId = null;
let currentRatingValue  = 0;

const API_URL = window.location.hostname === "localhost"
  ? "http://localhost:4000"
  : "";
// ======================================================
// CHARGEMENT NOTE PROFESSEUR
// ======================================================

async function loadProfessorRating(profId) {

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

    console.log("⭐ Rating professeur:", data);


    const display =
      document.getElementById("prof-rating-display");

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
  currentRatingProfId = profId  ?? null;
  currentRatingValue  = 0;
  console.log("⭐ Ouverture rating", profId);
loadProfessorRating(profId);
  
const modal     = document.getElementById("rating-modal");
  const profNameEl = document.getElementById("rating-prof-name");
  if (!modal) return;

  if (profNameEl) {
    profNameEl.textContent = profName
      ? `avec ${profName}`
      : "avec votre professeur";
  }

  // Reset étoiles
  document.querySelectorAll("#rating-stars span")
    .forEach(s => s.classList.remove("active"));

  // Reset commentaire
  const comment = document.getElementById("rating-comment");
  if (comment) comment.value = "";

  modal.style.display = "flex";
}
// ======================================================
// CLOSE
// ======================================================

export function closeRatingModal() {
  const modal = document.getElementById("rating-modal");
  if (modal) modal.style.display = "none";
  currentRatingProfId = null;
  currentRatingValue  = 0;
}

// ======================================================
// SUBMIT
// ======================================================

async function _submitRating() {
  if (!currentRatingValue) {
    // Signaler visuellement que l'élève doit choisir une note
    document.querySelectorAll("#rating-stars span").forEach(s => {
      s.style.animation = "pulse-dot 0.4s ease";
      setTimeout(() => s.style.animation = "", 400);
    });
    return;
  }

  const comment = document.getElementById("rating-comment")?.value?.trim() || "";
  const token   = localStorage.getItem("token");

  try {
    const res = await fetch(`${API_URL}/api/v1/ratings`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
    profId:   currentRatingProfId,
    rating:   currentRatingValue,
    comment,
    eleveId:  window.__APP_STATE__?.currentUser?.id  // ✅ ID élève depuis AppState
})
    });

    if (!res.ok) {
      console.error("❌ Erreur API notation:", res.status);
    } else {
      console.log("✅ Notation envoyée");
    }
  } catch (err) {
    console.error("❌ Erreur réseau notation:", err);
  }

  closeRatingModal();
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
