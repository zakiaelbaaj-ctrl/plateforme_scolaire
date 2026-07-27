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
  const modal = document.getElementById("rating-modal");
  if (modal) modal.style.display = "none";

  const errorEl = document.getElementById("rating-error");
  if (errorEl) {
    errorEl.style.display = "none";
    errorEl.textContent = "";
  }

  currentRatingProfId = null;
  currentRatingValue  = 0;
  ratingVisible = false;

  console.log("⭐ Modal notation fermée");

  // 🆕 Si une facture est en attente, on l'affiche avant de rediriger
  const pendingInvoiceRaw = localStorage.getItem("pendingInvoice");

  if (pendingInvoiceRaw) {
    localStorage.removeItem("pendingInvoice");
    const invoice = JSON.parse(pendingInvoiceRaw);
    showInvoiceBeforeRedirect(invoice);
    return; // ⛔ on ne redirige pas tout de suite
  }

  window.location.href = "/pages/eleve/profs_en_ligne.html";
}

// 🆕 Petite modale bloquante pour laisser le temps à l'élève de télécharger sa facture
function showInvoiceBeforeRedirect(invoice) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center; z-index: 10000;
  `;

  overlay.innerHTML = `
    <div style="position:relative; background:var(--ink-soft); border:1px solid var(--border-light);
                color:var(--text-primary); padding:32px; border-radius:16px; max-width:380px; width:90%;
                text-align:center; font-family: var(--font-body, system-ui, sans-serif);">
      <button id="invoice-close-btn"
        style="position:absolute; top:12px; right:14px; background:none; border:none;
               color:var(--text-muted, #888); font-size:20px; cursor:pointer; line-height:1;">
        ✕
      </button>

      <p style="font-family: var(--font-display); font-size:18px; margin-bottom:8px;">
        📥 <strong>Votre facture est prête</strong>
      </p>
      <p style="font-size:14px; color:var(--text-secondary); margin-bottom:24px;">
        Durée : ${invoice.dureeMinutes} min — Montant : ${invoice.montant}€
      </p>

       <a href="${invoice.url}" target="_blank"
          style="display:block; background:var(--accent); color:#fff; text-decoration:none;
          padding:10px 18px; border-radius:8px; font-weight:600; font-size:14px;
          margin-bottom:12px;">
       📥 Télécharger ma facture
         </a>

      <button id="invoice-continue-btn"
        style="background:var(--ink-muted); border:1px solid var(--border-light); color:var(--text-primary);
               padding:10px 18px; border-radius:8px; cursor:pointer; width:100%; font-size:14px; font-weight:600;
               font-family: var(--font-body);">
        🔎 Trouver un autre professeur
      </button>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("invoice-close-btn").onclick = () => {
    overlay.remove();
  };

  document.getElementById("invoice-continue-btn").onclick = () => {
    overlay.remove();
    window.location.href = "/pages/eleve/profs_en_ligne.html";
  };
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
