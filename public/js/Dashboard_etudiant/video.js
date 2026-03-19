/**
 * Fichier : public/js/Dashboard_etudiant/video.js
 * Rôle   : Gestion des sessions vidéo côté Étudiants
 * Niveau : Senior++++ (robuste, maintenable, extensible)
 */

(() => {
  "use strict";

  // ==========================
  // Configuration
  // ==========================
  const VIDEO_SERVER_URL = "wss://example.com/video"; // à remplacer par ton serveur WebSocket/WebRTC
  let socket = null;
  let isConnected = false;

  // ==========================
  // Sélecteurs DOM
  // ==========================
  const joinBtn = document.getElementById("joinVideoBtn");
  const leaveBtn = document.getElementById("leaveVideoBtn");
  const videoContainer = document.getElementById("videoContainer");
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

  function logInfo(msg) {
    console.info(`[Video] ${msg}`);
  }

  // ==========================
  // Gestion de la connexion vidéo
  // ==========================
  function connectToVideoSession() {
    if (isConnected) {
      showToast("Déjà connecté à la session vidéo", "warning");
      return;
    }

    socket = new WebSocket(VIDEO_SERVER_URL);

    socket.addEventListener("open", () => {
      isConnected = true;
      showToast("Connexion à la session vidéo établie", "success");
      logInfo("Connexion WebSocket ouverte.");
      // Ici tu pourrais initialiser WebRTC ou charger le flux vidéo
    });

    socket.addEventListener("message", (event) => {
      logInfo(`Message reçu : ${event.data}`);
      // Exemple : afficher un flux ou un message collaboratif
    });

    socket.addEventListener("close", () => {
      isConnected = false;
      showToast("Session vidéo terminée", "info");
      logInfo("Connexion WebSocket fermée.");
    });

    socket.addEventListener("error", (err) => {
      showToast("Erreur de connexion vidéo", "error");
      console.error("Erreur WebSocket :", err);
    });
  }

  function disconnectFromVideoSession() {
    if (!isConnected || !socket) {
      showToast("Pas de session vidéo active", "warning");
      return;
    }
    socket.close();
    socket = null;
    isConnected = false;
    showToast("Vous avez quitté la session vidéo", "info");
  }

  // ==========================
  // Gestion des événements UI
  // ==========================
  function bindEvents() {
    if (joinBtn) {
      joinBtn.addEventListener("click", connectToVideoSession);
    }
    if (leaveBtn) {
      leaveBtn.addEventListener("click", disconnectFromVideoSession);
    }
  }

  // ==========================
  // Initialisation
  // ==========================
  function init() {
    bindEvents();
    logInfo("Module vidéo étudiant initialisé.");
  }

  document.addEventListener("DOMContentLoaded", init);

})();
