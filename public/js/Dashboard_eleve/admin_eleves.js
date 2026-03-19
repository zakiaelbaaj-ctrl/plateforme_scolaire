let eleves = [];
let filteredEleves = [];
let pendingAction = null; // pour le modal

// -----------------------------
// FETCH DES ÉLÈVES AVEC HEURES
// -----------------------------
async function loadEleves() {
  try {
    const res = await fetch("/api/v1/eleves/avec_heures");
    const json = await res.json();

    if (!json.ok) throw new Error("Erreur API");

    eleves = json.data.map(e => ({
      ...e,
      fullname: `${e.prenom || ""} ${e.nom || ""}`.trim(),
      telephone: e.telephone || "—",
      pays: e.pays || "—",

      // 🔥 Correction : conversion en nombre
      heures_contact: Number(e.heures_contact) || 0,

      // 🔥 Correction : éviter les dates invalides
      date_inscription: e.date_inscription || null,

      statut: e.statut || "en_attente",
      subscription_status: e.subscription_status || "—",
      plan_type: e.plan_type || "—",
      free_trial_start: e.free_trial_start || null,
      free_trial_end: e.free_trial_end || null
    }));

    filteredEleves = [...eleves];
    displayEleves(filteredEleves);
  } catch (err) {
    console.error("❌ Erreur chargement des élèves:", err);
    alert("❌ Erreur chargement des élèves");
  }
}

// -----------------------------
// AFFICHAGE TABLEAU
// -----------------------------
function displayEleves(list) {
  const tbody = document.querySelector("#eleveTable tbody");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="empty-state">Aucun élève trouvé.</td></tr>`;
    return;
  }

  list.forEach((eleve, index) => {
    const statusClass = eleve.statut === "en_attente" ? "pending" : "validated";
    const statusText = eleve.statut === "en_attente" ? "⏳ En attente" : "✅ Validé";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(eleve.fullname)}</td>
      <td>${escapeHtml(eleve.email)}</td>
      <td>${escapeHtml(eleve.telephone)}</td>
      <td>${escapeHtml(eleve.pays)}</td>

      <!-- 🔥 Correction : toFixed sur un nombre -->
      <td>${(Number(eleve.heures_contact) || 0).toFixed(2)} h</td>

      <!-- 🔥 Correction : gestion date null -->
      <td>${eleve.date_inscription ? new Date(eleve.date_inscription).toLocaleDateString() : "—"}</td>

      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td>${escapeHtml(eleve.subscription_status)}</td>
      <td>${escapeHtml(eleve.plan_type)}</td>

      <td>
        ${eleve.free_trial_start ? new Date(eleve.free_trial_start).toLocaleDateString() : "—"}
        →
        ${eleve.free_trial_end ? new Date(eleve.free_trial_end).toLocaleDateString() : "—"}
      </td>

      <td>
        <div class="actions">
          ${eleve.statut === "en_attente"
            ? `<button class="validate-btn" onclick="openValidateModal(${index})">Valider</button>`
            : ""
          }
          <button class="delete-btn" onclick="openDeleteModal(${index})">Supprimer</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// -----------------------------
// ESCAPE HTML
// -----------------------------
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// -----------------------------
// RECHERCHE EN TEMPS RÉEL
// -----------------------------
document.getElementById("searchInput").addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  filteredEleves = eleves.filter(e =>
    `${e.nom} ${e.prenom} ${e.email}`.toLowerCase().includes(q)
  );
  displayEleves(filteredEleves);
});

// -----------------------------
// MODAL DE CONFIRMATION
// -----------------------------
function openValidateModal(index) {
  pendingAction = { type: "validate", index };
  showModal(`Valider cet élève ?`, `Êtes-vous sûr de valider "${escapeHtml(filteredEleves[index].fullname)}" ?`);
}

function openDeleteModal(index) {
  pendingAction = { type: "delete", index };
  showModal(`Supprimer cet élève ?`, `Êtes-vous sûr de supprimer "${escapeHtml(filteredEleves[index].fullname)}" ?`);
}

function showModal(title, message) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalMessage").textContent = message;
  document.getElementById("confirmModal").style.display = "block";
}

function closeModal() {
  pendingAction = null;
  document.getElementById("confirmModal").style.display = "none";
}

// -----------------------------
// ACTION MODAL CONFIRM
// -----------------------------
async function confirmAction() {
  if (!pendingAction) return;

  const { type, index } = pendingAction;
  const eleve = filteredEleves[index];

  try {
    if (type === "validate") {
      const res = await fetch(`/api/v1/eleves/${eleve.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: "valide" })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Erreur validation");
      eleve.statut = "valide";

    } else if (type === "delete") {
      const res = await fetch(`/api/v1/eleves/${eleve.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.message || "Erreur suppression");

      eleves = eleves.filter(e => e.id !== eleve.id);
      filteredEleves = filteredEleves.filter(e => e.id !== eleve.id);
    }

    displayEleves(filteredEleves);
  } catch (err) {
    console.error(err);
    alert("❌ " + err.message);
  } finally {
    closeModal();
  }
}

// -----------------------------
// INITIALISATION
// -----------------------------
loadEleves();
