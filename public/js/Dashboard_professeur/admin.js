// public/js/admin.js
// --------------------------------------------------
// Admin dashboard JS – senior+++, robuste et maintenable
// --------------------------------------------------

let profs = [];          // liste brute des professeurs
let filteredProfs = [];  // liste filtrée (recherche)
let pendingAction = null;

/**
 * Charger les professeurs depuis l’API
 */
async function loadProfs() {
  try {
    const res = await fetch("/api/v1/professeurs/avec_heures");
    const json = await res.json();

    if (!json.ok) throw new Error(json.message || "Erreur API");

    profs = json.data || [];
    filteredProfs = [...profs];
    renderProfsTable();
  } catch (err) {
    console.error("❌ Impossible de charger les professeurs:", err);
    showError("Erreur lors du chargement des professeurs");
  }
}

/**
 * Afficher les professeurs dans le tableau
 */
function renderProfsTable() {
  const tbody = document.getElementById("profsTableBody");
  tbody.innerHTML = "";

  if (filteredProfs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">Aucun professeur trouvé</td></tr>`;
    return;
  }

  filteredProfs.forEach((prof, index) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${prof.prenom}</td>
      <td>${prof.nom}</td>
      <td>${prof.email}</td>
      <td>${prof.telephone || "-"}</td>
      <td>${prof.matiere || "-"}</td>
      <td>${prof.heures_en_ligne || 0}</td>
      <td>
        <button class="btn btn-sm btn-danger" onclick="openDeleteModal(${index})">Supprimer</button>
      </td>
    `;

    tbody.appendChild(tr);
  });
}

/**
 * Filtrer les professeurs par recherche
 */
function filterProfs(query) {
  query = query.toLowerCase();
  filteredProfs = profs.filter(p =>
    p.nom.toLowerCase().includes(query) ||
    p.prenom.toLowerCase().includes(query) ||
    (p.email && p.email.toLowerCase().includes(query))
  );
  renderProfsTable();
}

/**
 * Ouvrir le modal de suppression
 */
function openDeleteModal(index) {
  pendingAction = { type: "delete", index };
  const prof = filteredProfs[index];

  document.getElementById("modalTitle").textContent = "Supprimer ce professeur ?";
  document.getElementById("modalMessage").textContent =
    `Voulez-vous vraiment supprimer ${prof.prenom} ${prof.nom} ?`;

  const modal = new bootstrap.Modal(document.getElementById("deleteModal"));
  modal.show();
}

/**
 * Confirmer la suppression
 */
async function confirmDelete() {
  if (!pendingAction || pendingAction.type !== "delete") return;

  const prof = filteredProfs[pendingAction.index];
  try {
    const res = await fetch(`/api/v1/professeurs/${prof.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" }
    });
    const json = await res.json();

    if (!json.ok) throw new Error(json.message || "Erreur API");

    // retirer du tableau local
    profs = profs.filter(p => p.id !== prof.id);
    filteredProfs = filteredProfs.filter(p => p.id !== prof.id);
    renderProfsTable();

    showSuccess("Professeur supprimé avec succès");
  } catch (err) {
    console.error("❌ Suppression échouée:", err);
    showError("Erreur lors de la suppression du professeur");
  } finally {
    pendingAction = null;
    const modal = bootstrap.Modal.getInstance(document.getElementById("deleteModal"));
    if (modal) modal.hide();
  }
}

/**
 * Helpers pour afficher messages
 */
function showError(msg) {
  const alert = document.getElementById("alertError");
  if (alert) {
    alert.textContent = msg;
    alert.style.display = "block";
  }
}

function showSuccess(msg) {
  const alert = document.getElementById("alertSuccess");
  if (alert) {
    alert.textContent = msg;
    alert.style.display = "block";
    setTimeout(() => (alert.style.display = "none"), 3000);
  }
}

// --------------------------------------------------
// Initialisation
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadProfs();

  const searchInput = document.getElementById("searchProfs");
  if (searchInput) {
    searchInput.addEventListener("input", e => filterProfs(e.target.value));
  }

  const confirmBtn = document.getElementById("confirmDeleteBtn");
  if (confirmBtn) {
    confirmBtn.addEventListener("click", confirmDelete);
  }
});
