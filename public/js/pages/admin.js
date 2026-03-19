// public/js/pages/admin.js
// Page orchestration for admin. Uses http.js and modal component.
// Expects server to expose API endpoints under window.API_BASE (e.g. "/api/v1/professeurs")
// This file is an ES module loaded by admin.html.

import { get, put, del } from "/js/lib/http.js";
import { clearToken, getAuthToken } from "/js/lib/auth.js";
import Modal from "/js/components/modal.js";

const API_PREFIX = window.API_BASE || "/api"; // server may set window.API_BASE = "/api/v1/professeurs"
const RESOURCE = "/professeurs"; // appended to API_PREFIX in requests

const state = {
  profs: [],
  filtered: [],
  loading: false,
  query: ""
};

const modal = Modal({ modalId: "confirmModal" });

function el(sel) { return document.querySelector(sel); }
function showError(msg) {
  const e = el("#errorState");
  e.textContent = msg;
  e.hidden = false;
  setTimeout(() => { e.hidden = true; }, 6000);
}
function setLoading(v) {
  state.loading = v;
  el("#loadingState").hidden = !v;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]));
}

async function loadProfs() {
  setLoading(true);
  try {
    // GET /api/professeurs/avec_heures
    const json = await get(`${RESOURCE}/avec_heures`);
    // Accept both { data: [...] } and raw array
    const items = Array.isArray(json) ? json : (json && json.data) ? json.data : [];
    state.profs = items.map(p => ({
      ...p,
      fullname: `${p.prenom || ""} ${p.nom || ""}`.trim(),
      matiere: p.matiere || "Non défini",
      heures_en_ligne: p.heures_en_ligne || 0
    }));
    applyFilter();
  } catch (err) {
    console.error("loadProfs error", err);
    showError(err.message || "Erreur lors du chargement des professeurs");
  } finally {
    setLoading(false);
  }
}

function applyFilter() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.profs.filter(p => !q || (p.fullname && p.fullname.toLowerCase().includes(q)));
  renderTable();
}

function renderTable() {
  const tbody = el("#profTable tbody");
  tbody.innerHTML = "";
  if (!state.filtered.length) {
    el("#emptyState").hidden = false;
    el("#tableMeta").textContent = "0 professeurs";
    return;
  }
  el("#emptyState").hidden = true;
  state.filtered.forEach((p, idx) => {
    const tr = document.createElement("tr");
    const statusClass = p.statut === "en_attente" ? "pending" : "validated";
    const statusText = p.statut === "en_attente" ? "⏳ En attente" : "✅ Validé";
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${escapeHtml(p.fullname)}</td>
      <td>${escapeHtml(p.matiere)}</td>
      <td><span class="status ${statusClass}">${statusText}</span></td>
      <td>${Number(p.heures_en_ligne)} h</td>
      <td>
        <div class="actions">
          ${p.statut === "en_attente" ? `<button class="btn validate-btn" data-action="validate" data-id="${p.id}">Valider</button>` : ""}
          <button class="btn delete-btn" data-action="delete" data-id="${p.id}">Supprimer</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  el("#tableMeta").textContent = `${state.filtered.length} professeurs`;
}

// Delegated click handler for actions
el("#profTable").addEventListener("click", (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) return;

  const prof = state.profs.find(p => String(p.id) === String(id));
  if (!prof) return;

  if (action === "validate") {
    modal.open({
      title: "Valider le professeur",
      message: `Confirmer la validation de "${prof.fullname}" ?`,
      confirmText: "Valider",
      onConfirmCallback: async () => {
        try {
          await put(`${RESOURCE}/${id}`, { statut: "valide" });
          await loadProfs();
        } catch (err) {
          console.error(err);
          showError("Erreur lors de la validation");
        }
      }
    });
  } else if (action === "delete") {
    modal.open({
      title: "Supprimer le professeur",
      message: `Cette action est définitive pour "${prof.fullname}". Continuer ?`,
      confirmText: "Supprimer",
      onConfirmCallback: async () => {
        try {
          await del(`${RESOURCE}/${id}`);
          await loadProfs();
        } catch (err) {
          console.error(err);
          showError("Erreur lors de la suppression");
        }
      }
    });
  }
});

// Search input
el("#searchInput").addEventListener("input", (e) => {
  state.query = e.target.value || "";
  applyFilter();
});

// Refresh and logout
el("#refreshBtn").addEventListener("click", () => loadProfs());
el("#logoutBtn").addEventListener("click", () => {
  clearToken();
  window.location.href = "/login.html";
});

// Init
(async function init() {
  // Optional: redirect if not authenticated
  // if (!getAuthToken()) window.location.href = "/login.html";

  // Load initial data
  await loadProfs();
})();
