// ============================================
// 🎯 MODAL PRÉFÉRENCES ÉTUDIANT (ES Module)
// (Matière étudiée / Langue d'enseignement / Niveau)
// Affiché à CHAQUE connexion, avant redirection dashboard
// À placer dans le même dossier que login_etudiant.js (ex: js/auth/)
// ============================================

const API_URL =
  window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? "http://localhost:4000"
    : "";
const API_BASE = `${API_URL}/api/v1/etudiant`;

// ---- Options (copiées depuis le formulaire d'inscription) ----
const MATIERES = {
  "Sciences": ["Mathématiques", "Physique-Chimie", "SVT", "Biologie", "Chimie", "Médecine"],
  "Langues": ["Arabe", "Français", "Anglais", "Espagnol"],
  "Technologie": ["Informatique", "Programmation", "Réseaux & Systèmes", "Sciences de l'ingénieur"],
  "Lettres": ["Histoire-Géographie", "Philosophie"],
  "Économie & Droit": ["Économie", "Économie-Gestion", "Comptabilité", "Marketing", "Droit", "Sciences Politiques"],
  "Arts & Autres": ["Musique", "Arts plastiques", "Formation professionnelle"]
};

const LANGUES = [
  "Arabe", "Français", "Anglais", "Espagnol", "Allemand", "Italien",
  "Chinois", "Russe", "Turc", "Portugais", "Pologne", "Persan", "Berber"
];

const NIVEAUX = {
  "Post-bac": ["BTS", "BUT", "Prépa CPGE"],
  "Université": ["Licence 1", "Licence 2", "Licence 3", "Master 1", "Master 2", "Doctorat"],
  "Autres formations": ["Formation professionnelle"]
};

// ---- Helpers DOM ----
function buildSelect(id, label, groupedOptions, flatOptions) {
  const wrapper = document.createElement("div");
  wrapper.className = "pref-form-group";

  const lbl = document.createElement("label");
  lbl.setAttribute("for", id);
  lbl.textContent = label;
  wrapper.appendChild(lbl);

  const select = document.createElement("select");
  select.id = id;
  select.name = id;
  select.required = true;

  const emptyOpt = document.createElement("option");
  emptyOpt.value = "";
  emptyOpt.textContent = `-- Choisir --`;
  select.appendChild(emptyOpt);

  if (flatOptions) {
    flatOptions.forEach((val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      select.appendChild(opt);
    });
  } else if (groupedOptions) {
    Object.entries(groupedOptions).forEach(([groupLabel, values]) => {
      const group = document.createElement("optgroup");
      group.label = groupLabel;
      values.forEach((val) => {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = val;
        group.appendChild(opt);
      });
      select.appendChild(group);
    });
  }

  wrapper.appendChild(select);
  return { wrapper, select };
}

function injectStyles() {
  if (document.getElementById("pref-modal-styles")) return;
  const style = document.createElement("style");
  style.id = "pref-modal-styles";
  style.textContent = `
    .pref-modal-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.5);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
    }
    .pref-modal-box {
      background: #fff; border-radius: 12px; padding: 28px;
      max-width: 420px; width: 90%; box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      font-family: inherit;
    }
    .pref-modal-box h2 {
      margin: 0 0 8px; font-size: 1.3rem;
    }
    .pref-modal-box p.pref-subtitle {
      margin: 0 0 20px; color: #666; font-size: 0.9rem;
    }
    .pref-form-group { margin-bottom: 16px; }
    .pref-form-group label {
      display: block; margin-bottom: 6px; font-weight: 600; font-size: 0.9rem;
    }
    .pref-form-group select {
      width: 100%; padding: 10px; border-radius: 8px;
      border: 1px solid #ccc; font-size: 0.95rem;
    }
    .pref-error {
      color: #d32f2f; font-size: 0.85rem; margin-bottom: 12px; display: none;
    }
    .pref-submit-btn {
      width: 100%; padding: 12px; border: none; border-radius: 8px;
      background: #1976d2; color: #fff; font-size: 1rem; font-weight: 600;
      cursor: pointer; margin-top: 8px;
    }
    .pref-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
  `;
  document.head.appendChild(style);
}

/**
 * Affiche le modal de préférences.
 * @param {string} accessToken - token JWT de l'étudiant connecté
 * @returns {Promise<{matiere:string, langue_matiere:string, niveau:string}>}
 */
export function showPreferencesModal(accessToken) {
  return new Promise((resolve, reject) => {
    injectStyles();

    const overlay = document.createElement("div");
    overlay.className = "pref-modal-overlay";

    const box = document.createElement("div");
    box.className = "pref-modal-box";

    box.innerHTML = `
      <h2>Avant de continuer</h2>
      <p class="pref-subtitle">Merci de confirmer vos préférences pour cette session.</p>
      <div class="pref-error" id="prefError"></div>
    `;

    const { wrapper: matiereWrap, select: matiereSelect } = buildSelect(
      "pref_matiere", "Matière étudiée", MATIERES, null
    );
    const { wrapper: langueWrap, select: langueSelect } = buildSelect(
      "pref_langue_matiere", "Langue d'enseignement", null, LANGUES
    );
    const { wrapper: niveauWrap, select: niveauSelect } = buildSelect(
      "pref_niveau", "Niveau", NIVEAUX, null
    );

    box.appendChild(matiereWrap);
    box.appendChild(langueWrap);
    box.appendChild(niveauWrap);

    const submitBtn = document.createElement("button");
    submitBtn.className = "pref-submit-btn";
    submitBtn.textContent = "Valider";
    box.appendChild(submitBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const errorDiv = box.querySelector("#prefError");

    submitBtn.addEventListener("click", async () => {
      const matiere = matiereSelect.value;
      const langue_matiere = langueSelect.value;
      const niveau = niveauSelect.value;

      if (!matiere || !langue_matiere || !niveau) {
        errorDiv.textContent = "Veuillez remplir les 3 champs.";
        errorDiv.style.display = "block";
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "Enregistrement...";
      errorDiv.style.display = "none";

      try {
        const res = await fetch(`${API_BASE}/preferences`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ matiere, langue_matiere, niveau })
        });

        const json = await res.json();

        if (!res.ok) {
          throw new Error(json.message || "Erreur lors de l'enregistrement");
        }

        document.body.removeChild(overlay);
        resolve({ matiere, langue_matiere, niveau });
      } catch (err) {
        errorDiv.textContent = err.message || "Une erreur est survenue.";
        errorDiv.style.display = "block";
        submitBtn.disabled = false;
        submitBtn.textContent = "Valider";
      }
    });
  });
}