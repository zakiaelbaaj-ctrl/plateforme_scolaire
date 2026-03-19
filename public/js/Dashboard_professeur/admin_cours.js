/**
 * Fichier : public/js/dashboard_professeur/admin_cours.js
 * Rôle   : Gestion des cours côté Professeurs
 * Niveau : Senior++++ (modulaire, maintenable, extensible)
 */

(() => {
  "use strict";

  // ==========================
  // Données simulées (mock)
  // ==========================
  const coursProgrammes = [
    { id: 301, titre: "Algèbre avancée", prof: "Durand Paul", date: "15/01/2026", heure: "10h00", salle: "Salle 12" },
    { id: 302, titre: "Physique quantique", prof: "Nguyen Thanh", date: "20/01/2026", heure: "14h00", salle: "Salle 8" }
  ];

  // ==========================
  // Sélecteurs DOM
  // ==========================
  const tableBody = document.getElementById("coursTable");
  const calendar = document.getElementById("calendar");

  // ==========================
  // Fonctions utilitaires
  // ==========================
  const formatDate = (date) => {
    const d = new Date(date);
    return d.toLocaleDateString("fr-FR");
  };

  const parseDateStr = (str) => {
    const [jour, mois, annee] = str.split("/");
    return new Date(`${annee}-${mois}-${jour}`);
  };

  // ==========================
  // Rendu du tableau des cours
  // ==========================
  function renderCoursTable() {
    tableBody.innerHTML = "";
    coursProgrammes.forEach(cours => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${cours.id}</td>
        <td>${cours.titre}</td>
        <td>${cours.prof}</td>
        <td>${cours.date}</td>
        <td>${cours.heure}</td>
        <td>${cours.salle}</td>
        <td class="table-actions">
          <button data-id="${cours.id}" class="edit-btn">Modifier</button>
          <button data-id="${cours.id}" class="delete-btn">Supprimer</button>
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
      const hasCourse = coursProgrammes.some(c => c.date === dateStr);

      const div = document.createElement("div");
      div.textContent = d;
      if (isToday) div.classList.add("today");
      if (hasCourse) div.classList.add("course-day");
      calendar.appendChild(div);
    }
  }

  // ==========================
  // Actions sur les cours
  // ==========================
  function editCours(id) {
    const cours = coursProgrammes.find(c => c.id === Number(id));
    if (!cours) return console.warn(`Cours ID ${id} introuvable`);
    // Ici tu peux ouvrir un modal ou formulaire
    console.info("Édition du cours :", cours);
  }

  function deleteCours(id) {
    const index = coursProgrammes.findIndex(c => c.id === Number(id));
    if (index === -1) return console.warn(`Cours ID ${id} introuvable`);

    if (confirm(`Supprimer le cours ID ${id} ?`)) {
      coursProgrammes.splice(index, 1);
      renderCoursTable();
      renderCalendar();
      console.info(`Cours ID ${id} supprimé`);
    }
  }

  // ==========================
  // Gestion des événements
  // ==========================
  function bindEvents() {
    tableBody.addEventListener("click", (e) => {
      if (e.target.classList.contains("edit-btn")) {
        editCours(e.target.dataset.id);
      }
      if (e.target.classList.contains("delete-btn")) {
        deleteCours(e.target.dataset.id);
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
    console.info("Dashboard Professeur — Gestion des cours initialisé.");
  }

  // Lancement
  document.addEventListener("DOMContentLoaded", init);

})();
