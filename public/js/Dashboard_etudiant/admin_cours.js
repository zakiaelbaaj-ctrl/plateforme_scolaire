/**
 * Fichier : public/js/Dashboard_etudiant/admin_cours.js
 * Rôle   : Gestion des cours côté Étudiants
 * Niveau : Senior++++ (collaboration, extensible, maintenable)
 */

(() => {
  "use strict";

  // ==========================
  // Données simulées (mock)
  // ==========================
  const coursCollaboratifs = [
    { id: 501, titre: "Projet de recherche IA", prof: "Durand Paul", date: "22/02/2026", heure: "15h00", salle: "Salle 10", visio: true, ressources: true },
    { id: 502, titre: "Séminaire de physique appliquée", prof: "Nguyen Thanh", date: "25/02/2026", heure: "13h00", salle: "Salle 7", visio: false, ressources: true }
  ];

  const participations = new Set(); // IDs des cours où l'étudiant participe

  // ==========================
  // Sélecteurs DOM
  // ==========================
  const tableBody = document.getElementById("coursTable");
  const calendar = document.getElementById("calendar");
  const toastContainer = document.getElementById("toastContainer");

  // ==========================
  // Utilitaires
  // ==========================
  function showToast(message, type = "info") {
    if (!toastContainer) return alert(message);
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ==========================
  // Rendu du tableau
  // ==========================
  function renderCoursTable() {
    tableBody.innerHTML = "";
    coursCollaboratifs.forEach(cours => {
      const participe = participations.has(cours.id);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${cours.id}</td>
        <td>${cours.titre}</td>
        <td>${cours.prof}</td>
        <td>${cours.date}</td>
        <td>${cours.heure}</td>
        <td>${cours.salle}</td>
        <td class="table-actions">
          <button data-id="${cours.id}" class="participer-btn" ${participe ? "disabled aria-disabled='true'" : ""}>
            ${participe ? "Déjà participant" : "Participer"}
          </button>
          ${cours.visio ? `<button data-id="${cours.id}" class="visio-btn">Rejoindre Visio</button>` : ""}
          ${cours.ressources ? `<button data-id="${cours.id}" class="ressources-btn">Ressources</button>` : ""}
        </td>
      `;
      tableBody.appendChild(row);
    });
  }

  // ==========================
  // Rendu du calendrier
  // ==========================
  function renderCalendar() {
    calendar.innerHTML = "";
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
      calendar.innerHTML += "<div></div>";
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${d.toString().padStart(2,"0")}/${(month+1).toString().padStart(2,"0")}/${year}`;
      const isToday = d === today;
      const hasCourse = coursCollaboratifs.some(c => c.date === dateStr);

      const div = document.createElement("div");
      div.textContent = d;
      if (isToday) div.classList.add("today");
      if (hasCourse) div.classList.add("course-day");
      calendar.appendChild(div);
    }
  }

  // ==========================
  // Actions côté étudiant
  // ==========================
  function participerCours(id) {
    const cours = coursCollaboratifs.find(c => c.id === Number(id));
    if (!cours) return console.warn(`Cours ID ${id} introuvable`);

    if (!participations.has(cours.id)) {
      participations.add(cours.id);
      showToast(`Participation confirmée au cours : ${cours.titre}`, "success");
      renderCoursTable();
    } else {
      showToast(`Vous participez déjà à ce cours : ${cours.titre}`, "warning");
    }
  }

  function rejoindreVisio(id) {
    const cours = coursCollaboratifs.find(c => c.id === Number(id));
    if (!cours || !cours.visio) return showToast("Visio non disponible pour ce cours", "error");
    showToast(`Connexion à la visio du cours : ${cours.titre}`, "info");
    // Ici tu pourrais ouvrir un lien vers une plateforme de visio
  }

  function afficherRessources(id) {
    const cours = coursCollaboratifs.find(c => c.id === Number(id));
    if (!cours || !cours.ressources) return showToast("Pas de ressources disponibles", "error");
    showToast(`Ouverture des ressources du cours : ${cours.titre}`, "info");
    // Ici tu pourrais charger une page de ressources
  }

  // ==========================
  // Gestion des événements
  // ==========================
  function bindEvents() {
    tableBody.addEventListener("click", (e) => {
      if (e.target.classList.contains("participer-btn")) {
        participerCours(e.target.dataset.id);
      }
      if (e.target.classList.contains("visio-btn")) {
        rejoindreVisio(e.target.dataset.id);
      }
      if (e.target.classList.contains("ressources-btn")) {
        afficherRessources(e.target.dataset.id);
      }
    });
  }

  // ==========================
  // Initialisation
  // ==========================
  function init() {
    renderCoursTable();
    renderCalendar();
    bindEvents();
    console.info("Dashboard Étudiant — Gestion des cours initialisé.");
  }

  document.addEventListener("DOMContentLoaded", init);

})();
