/**
 * Fichier : public/js/Dashboard_etudiant/chat.js
 * Rôle   : Module de chat collaboratif côté Étudiants
 * Niveau : Senior++++ (robuste, maintenable, extensible)
 */

(() => {
  "use strict";

  // ==========================
  // Variables globales
  // ==========================
  let socket;              // WebSocket (sera initialisé dans connectToChat)
  let isConnected = false; // état de connexion

  // ==========================
  // Sélecteurs DOM
  // ==========================
  const chatBox = document.getElementById("chatBox");       // conteneur des messages
  const chatForm = document.getElementById("chatForm");     // formulaire d'envoi
  const chatInput = document.getElementById("chatInput");   // champ texte
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
    console.info(`[Chat] ${msg}`);
  }

  function appendMessage(content, sender = "system", timestamp = new Date()) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `chat-message ${sender}`;

    const bubble = document.createElement("div");
    bubble.className = "chat-bubble";
    bubble.textContent = content;
    bubble.setAttribute("data-time", new Date(timestamp).toLocaleTimeString());

    msgDiv.appendChild(bubble);
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
  }

  // ==========================
  // Gestion de la connexion
  // ==========================
  const CHAT_SERVER_URL = "ws://localhost:4000";

  function connectToChat() {
    if (isConnected) return;

    socket = new WebSocket(CHAT_SERVER_URL);

    socket.addEventListener("open", () => {
      isConnected = true;
      showToast("Connecté au chat collaboratif", "success");
      logInfo("Connexion WebSocket ouverte.");

      // Exemple : enregistrer l'étudiant
      socket.send(JSON.stringify({
        type: "register",
        username: "Zaza", // ⚠️ à remplacer par l'utilisateur connecté
        country: "France",
        subjects: ["Maths"],
        languages: ["Français"]
      }));
    });

    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "chat") {
          appendMessage(`${data.sender}: ${data.message}`, "remote", data.timestamp);
        } else if (data.type === "profList") {
          console.log("Liste des profs disponibles:", data.profs);
        } else if (data.type === "appelEnAttente") {
          console.log("Appels en attente:", data.appels);
        } else if (data.type === "newFile") {
          appendMessage(`📂 Fichier reçu de ${data.sender}: ${data.filename}`, "remote");
        } else if (data.type === "erreur") {
          showToast(data.message, "error");
        } else {
          logInfo("Message inconnu reçu: " + JSON.stringify(data));
        }
      } catch {
        appendMessage(event.data, "remote");
      }
    });

    socket.addEventListener("close", () => {
      isConnected = false;
      showToast("Chat déconnecté", "info");
      logInfo("Connexion WebSocket fermée.");
    });

    socket.addEventListener("error", (err) => {
      showToast("Erreur de connexion au chat", "error");
      console.error("Erreur WebSocket :", err);
    });
  }

  function disconnectChat() {
    if (socket) {
      socket.close();
      socket = null;
      isConnected = false;
    }
  }

  // ==========================
  // Envoi de message
  // ==========================
  function sendMessage(message) {
    if (!isConnected || !socket) {
      showToast("Non connecté au chat", "warning");
      return;
    }
    const payload = {
      type: "chat",
      sender: "Zaza",   // ⚠️ à remplacer par l'utilisateur connecté
      target: "AN",     // ⚠️ destinataire (prof ou autre étudiant)
      message
    };
    socket.send(JSON.stringify(payload));
    appendMessage(`Moi: ${payload.message}`, "local", new Date().toISOString());
  }

  // ==========================
  // Gestion des événements UI
  // ==========================
  function bindEvents() {
    chatForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const message = chatInput.value.trim();
      if (message) {
        sendMessage(message);
        chatInput.value = "";
      }
    });
  }

  // ==========================
  // Initialisation
  // ==========================
  function init() {
    connectToChat();
    bindEvents();
    logInfo("Module chat étudiant initialisé.");
  }

  document.addEventListener("DOMContentLoaded", init);

})();
