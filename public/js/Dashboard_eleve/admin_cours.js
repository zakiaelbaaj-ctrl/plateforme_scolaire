/**
 * Fichier : public/js/Dashboard_eleve/admin_cours.js
 * Rôle   : Gestion des cours côté Élèves
 * Niveau : Senior++++ (robuste, maintenable, extensible)
 */

(() => {
  "use strict";

  // ==========================
  // Données simulées (mock)
  // ==========================
  const coursDisponibles = [
    { id: 401, titre: "Introduction à la programmation", prof: "Martin Sophie", date: "12/02/2026", heure: "09h00", salle: "Salle 5" },
    { id: 402, titre: "Histoire moderne", prof: "Bernard Alain", date: "18/02/2026", heure: "11h00", salle: "Salle 3" }
  ];

  const inscriptions = new Set(); // IDs des cours auxquels l'élève est inscrit

  // ==========================
  // Sélecteurs DOM
  // ==========================
  const tableBody = document.getElementById("coursTable");
  const calendar = document.getElementById("calendar");
  const toastContainer = document.getElementById("toastContainer"); // prévoir un <div id="toastContainer"></div> dans le HTML

  // ==========================
  // Fonctions utilitaires
  // ==========================
  const parseDateStr = (str) => {
    const [jour, mois, annee] = str.split("/");
    return new Date(`${annee}-${mois}-${jour}`);
  };

  function showToast(message, type = "info") {
    if (!toastContainer) return alert(message); // fallback si pas de container
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  // ==========================
  // Rendu du tableau des cours
  // ==========================
  function renderCoursTable() {
    tableBody.innerHTML = "";
    coursDisponibles.forEach(cours => {
      const inscrit = inscriptions.has(cours.id);
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${cours.id}</td>
        <td>${cours.titre}</td>
        <td>${cours.prof}</td>
        <td>${cours.date}</td>
        <td>${cours.heure}</td>
        <td>${cours.salle}</td>
        <td class="table-actions">
          <button data-id="${cours.id}" class="inscrire-btn" ${inscrit ? "disabled aria-disabled='true'" : ""}>
            ${inscrit ? "Déjà inscrit" : "S'inscrire"}
          </button>
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

    // Jours vides avant le 1er
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
      calendar.innerHTML += "<div></div>";
    }

    // Jours du mois
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${d.toString().padStart(2,"0")}/${(month+1).toString().padStart(2,"0")}/${year}`;
      const isToday = d === today;
      const hasCourse = coursDisponibles.some(c => c.date === dateStr);

      const div = document.createElement("div");
      div.textContent = d;
      if (isToday) div.classList.add("today");
      if (hasCourse) div.classList.add("course-day");
      calendar.appendChild(div);
    }
  }

  // ==========================
  // Actions côté élève
  // ==========================
  function inscrireCours(id) {
    const cours = coursDisponibles.find(c => c.id === Number(id));
    if (!cours) return console.warn(`Cours ID ${id} introuvable`);

    if (!inscriptions.has(cours.id)) {
      inscriptions.add(cours.id);
      showToast(`Inscription réussie au cours : ${cours.titre}`, "success");
      renderCoursTable();
    } else {
      showToast(`Vous êtes déjà inscrit à ce cours : ${cours.titre}`, "warning");
    }
  }

  // ==========================
  // Gestion des événements
  // ==========================
  function bindEvents() {
    tableBody.addEventListener("click", (e) => {
      if (e.target.classList.contains("inscrire-btn")) {
        inscrireCours(e.target.dataset.id);
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
    console.info("Dashboard Élève — Gestion des cours initialisé.");
  }

  // Lancement
  document.addEventListener("DOMContentLoaded", init);

})();
