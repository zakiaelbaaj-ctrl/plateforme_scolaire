// =======================================================
// DASHBOARD PROFESSEUR – VERSION FINALE CORRIGÉE
// =======================================================
  import { AppState } from "./whiteboard/state.js";  // ← METTRE ICI, tout en haut
// -------------------------------------------------------
// ÉTAT GLOBAL
// -------------------------------------------------------
let ws = null;
let selectedStudentId = null;
let currentRoomId = null;
let twilioRoom = null;
let timerInterval = null;
let elapsedSeconds = 0;
let sessionInProgress = false;

import { WhiteboardCore } from "./whiteboard/whiteboard.core.js";
import { WhiteboardSocket } from "./whiteboard/whiteboard.socket.js";
import { WhiteboardTools } from "./whiteboard/whiteboard.tools.js";
import { State } from "./state.js";
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("initWhiteboardBtn")?.addEventListener("click", () => {
    WhiteboardCore.init("whiteboard-canvas");
    WhiteboardSocket.init(ws, currentRoomId, "prof");
  // Exemple d’utilisation des outils au démarrage
  WhiteboardTools.selectTool("pen");
  WhiteboardTools.setColor("#2563eb");
  WhiteboardTools.setSize(2);
  });

  document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => {
    WhiteboardCore.clear();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "whiteboard:clear", roomId: currentRoomId }));
    }
  });

  document.getElementById("downloadWhiteboardBtn")?.addEventListener("click", () => {
    WhiteboardCore.download();
  });
});

// Récupération des infos utilisateur depuis localStorage
const token = localStorage.getItem("token");
const userData = localStorage.getItem("currentUser");

if (!token || !userData) {
  window.location.replace("login_professeur.html");
}

const currentUser = JSON.parse(userData);

if (!currentUser || currentUser.role !== "prof") {
  console.error("Accès refusé : utilisateur non professeur");
  window.location.replace("login_professeur.html");
}

// -------------------------------------------------------
// AFFICHAGE INFOS PROFESSEUR
// -------------------------------------------------------
const profName = document.getElementById("prof-name");
if (profName) profName.textContent = currentUser.prenom;

const profNameFull = document.getElementById("profName");
if (profNameFull) profNameFull.textContent = `${currentUser.prenom} ${currentUser.nom}`;

const profLocation = document.getElementById("profLocation");
if (profLocation) profLocation.textContent = `${currentUser.ville || "Ville non définie"}, ${currentUser.pays || "Pays non défini"}`;

// -------------------------------------------------------
// INIT WebSocket et UI au chargement
// -------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  bindUI();

  const btnExit = document.getElementById("btn-exit-visio");
  if (btnExit) btnExit.style.display = "none";

  initWebSocket();
});

// -------------------------------------------------------
// WEBSOCKET
// -------------------------------------------------------
function initWebSocket() {
  if (AppState.ws && AppState.ws.readyState === WebSocket.OPEN) {
    console.warn("⚠️ WebSocket déjà ouvert, annulation");
    return;
  }

  if (!token) return;

  const WS_BASE = (location.protocol === "https:" ? "wss://" : "ws://") + location.host;
  AppState.ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);

  AppState.ws.onopen = () => {
    console.log("✅ WebSocket professeur connecté");

    const identifyPayload = {
      type: "identify",
      prenom: currentUser.prenom,
      nom: currentUser.nom,
      ville: currentUser.ville || "",
      pays: currentUser.pays || ""
    };

    setTimeout(() => {
      AppState.ws.send(JSON.stringify(identifyPayload));
      console.log("📤 Identify envoyé:", identifyPayload);
    }, 50);
  };

  AppState.ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.error("❌ Message WS invalide :", event.data);
      return;
    }

    console.log("📨 Prof WS message:", data);

    switch (data.type) {
      case "onlineProfessors":
        console.log("📡 onlineProfessors (côté prof):", data.profs);
        break;

      case "incomingCall":
        handleIncomingCall(data);
        break;

      case "callAccepted":
        if (!data.eleveId) {
          console.error("Impossible de démarrer la session : eleveId manquant");
          break;
        }
        selectedStudentId = data.eleveId;
        startSessionProf();
        startTimer();
        break;

      case "callRejected":
        handleCallRejected(data);
        break;

      case "callEnded":
  AppState.resetSession();
  handleCallEnded(data);
  break;

      case "startSession":
        console.log("🎯 Session démarrée :", data);
        break;

      case "joinedRoom":
        console.log("🎓 Room jointe :", data.roomId);
        break;

      case "userJoined":
        console.log("👤 Un utilisateur a rejoint la room :", data);
        break;

      case "chatMessage":
        renderChat(data);
        break;

      case "document":
        receiveDocument(data);
        break;

      case "visioSaved":
        showInvoice(data);
        break;

      case "error":
        console.error("❌ MESSAGE:", data.message);
        console.error("❌ DATA COMPLETE:", JSON.stringify(data, null, 2));

        const isInternalError = data.message &&
          (data.message.includes("serveur") ||
           data.message.includes("internal") ||
           data.message.includes("interne"));

        if (isInternalError) {
          console.warn("⚠️ Erreur serveur interne détectée");
        } else {
          alert("❌ Erreur: " + (data.message || "Erreur inconnue"));
        }
        break;

      case "professorsList":
        console.log("📚 Liste des profs reçue (ignorée côté prof)");
        break;

      case "updateStatus":
        console.log("🔄 Statut mis à jour (ignoré côté prof):", data);
        break;

      default:
        console.warn("⚠️ Type WS non géré côté PROF :", data.type, data);
    }
  };

  AppState.ws.onclose = () => {
    console.warn("⚠️ WebSocket professeur déconnecté, reconnexion dans 1s...");
    setTimeout(initWebSocket, 1000);
  };

  AppState.ws.onerror = (err) => {
    console.error("❌ WebSocket erreur :", err);
  };
}

// -------------------------------------------------------
// HANDLERS WS
// -------------------------------------------------------
function handleIncomingCall(data) {
  console.log("🔔 Appel entrant :", data);

  const eleveId = data.eleveId ?? data.fromUserId;
  const eleveName = data.eleveName ?? data.fromName;

  selectedStudentId = eleveId;

  const eleveInfoEl = document.getElementById("eleve-info");
  if (eleveInfoEl) {
    eleveInfoEl.innerHTML = `
      <strong>${eleveName}</strong><br>
      <small>ID: ${eleveId}</small>
    `;
  }

  const incomingEl = document.getElementById("incoming-call");
  const callInfoEl = document.getElementById("call-info");
  if (incomingEl && callInfoEl) {
    callInfoEl.textContent = `Appel entrant de ${eleveName} (ID: ${eleveId})`;
    incomingEl.style.display = "block";
  }
}

function acceptCall() {
  console.log("✅ acceptCall() déclenché");

  if (!selectedStudentId) return;

  ws.send(JSON.stringify({
    type: "acceptCall",
    eleveId: selectedStudentId
  }));
  console.log("✅ Appel accepté pour élève:", selectedStudentId);

  const incomingEl = document.getElementById("incoming-call");
  if (incomingEl) incomingEl.style.display = "none";

}

function rejectCall() {
  console.log("❌ rejectCall() déclenché");
  console.log("❌ Appel rejeté par le professeur");

  if (!selectedStudentId) return;

  ws.send(JSON.stringify({
    type: "rejectCall",
    eleveId: selectedStudentId
  }));

  const incomingEl = document.getElementById("incoming-call");
  if (incomingEl) incomingEl.style.display = "none";

  selectedStudentId = null;
}

// ✅ NOUVEAU : Handler pour appel rejeté par l'élève
function handleCallRejected(data) {
  console.log("❌ Appel rejeté par l'élève:", data);

  sessionInProgress = false;
  selectedStudentId = null;

  const eleveInfoEl = document.getElementById("eleve-info");
  if (eleveInfoEl) {
    eleveInfoEl.innerHTML = `
      <strong>❌ Appel Rejeté</strong><br>
      <small>L'élève a refusé l'appel</small>
    `;
  }

  alert("L'élève a refusé votre appel");
}

// ✅ NOUVEAU : Handler pour fin d'appel
function handleCallEnded(data) {
  console.log("📞 Appel terminé par l'élève");
  leaveSession();
}

// -------------------------------------------------------
// BIND UI
// -------------------------------------------------------
function bindUI() {
  const chatForm = document.getElementById("chatForm");
  if (chatForm) {
    chatForm.addEventListener("submit", sendChat);
  }

  const sendMsgBtn = document.getElementById("send-msg");
  if (sendMsgBtn) {
    sendMsgBtn.onclick = (e) => {
      e.preventDefault();
      sendChat(e);
    };
  }

  const sendFileBtn = document.getElementById("send-file");
  if (sendFileBtn) {
    sendFileBtn.onclick = sendDocument;
  }

  const exitBtn = document.getElementById("btn-exit-visio");
  if (exitBtn) {
    exitBtn.onclick = leaveSession;
  }
}

// -------------------------------------------------------
// TIMER
// -------------------------------------------------------
function startTimer() {
  stopTimer();
  elapsedSeconds = 0;

  timerInterval = setInterval(() => {
    elapsedSeconds++;
    const el = document.getElementById("call-time");
    if (el) el.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${m}:${s}`;
}

// -------------------------------------------------------
// LEAVE SESSION
// -------------------------------------------------------
function leaveSession() {
  console.log("🚪 Déconnexion de la session visio");

  stopTimer();

  if (twilioRoom) {
    twilioRoom.disconnect();
    twilioRoom = null;
  }

  // ✅ NOUVEAU : Notifier le serveur que le prof est libre
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "updateStatus",
      profId: currentUser.id,
      status: "disponible",
      eleveId: null,
      sessionStartedAt: null
    }));
    console.log("🔄 Statut mis à jour : disponible");
  }

  // Envoyer la durée pour la facturation
  if (ws && ws.readyState === WebSocket.OPEN && currentRoomId && elapsedSeconds > 0) {
    ws.send(JSON.stringify({
      type: "visioDuration",
      roomId: currentRoomId,
      duration: elapsedSeconds,
      matiere: localStorage.getItem("matiere") || "Non spécifiée",
      niveau: localStorage.getItem("niveau") || "Non spécifié"
    }));
  }

  currentRoomId = null;
  sessionInProgress = false;

  const btnExit = document.getElementById("btn-exit-visio");
  if (btnExit) btnExit.style.display = "none";

  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";

  console.log("✅ Session quittée proprement");
}

// -------------------------------------------------------
// SESSION PROF (TWILIO + ROOM WS)
// -------------------------------------------------------
let sessionStarted = false;

function startSessionProf() {
  // 🔒 Empêche les doublons 
  if (sessionStarted) { 
    console.warn("⚠️ Session déjà démarrée — appel ignoré"); 
    return; 
  } 
  sessionStarted = true;

  // 🧪 Vérification des prérequis
  if (!currentUser || !selectedStudentId) {
    console.error("Impossible de démarrer la session : élève non défini");
    return;
  }

  // Crée l'ID de room : prof + élève
  currentRoomId = `room_${currentUser.id}_${selectedStudentId}`;
  sessionInProgress = true;  // ← Tracker

  if (ws && ws.readyState === WebSocket.OPEN) {
    // ✅ Notifier le serveur que le prof est en session
    ws.send(JSON.stringify({
      type: "updateStatus",
      profId: currentUser.id,
      status: "en_appel",
      eleveId: selectedStudentId,
      sessionStartedAt: new Date().toISOString()
    }));
    console.log("🔄 Statut mis à jour : en session avec élève", selectedStudentId);

    // Rejoindre la room côté serveur (chat / tableau / docs / etc.)
    ws.send(JSON.stringify({
      type: "joinRoom",
      roomId: currentRoomId
    }));
    console.log("🎓 joinRoom envoyé au backend");
  }

  // Démarrer la visio Twilio
  startTwilioVideo();

  // Démarrage automatique du whiteboard
  if (window.WhiteboardCore && window.WhiteboardSocket) {
    WhiteboardCore.init("whiteboard-canvas");
    WhiteboardSocket.init(ws, currentRoomId, "prof");
    console.log("📝 Whiteboard lancé automatiquement pour la session");
  } else {
    console.warn("⚠️ Whiteboard non chargé ou modules manquants");
  }
}

// -------------------------------------------------------
// TWILIO VIDEO (Professeur)
// -------------------------------------------------------
async function startTwilioVideo() {
  if (!currentRoomId || !currentUser?.id || !token) {
    console.error("❌ Impossible de démarrer Twilio Video (infos manquantes)");
    return;
  }

  if (!window.Twilio || !Twilio.Video) {
    console.error("SDK Twilio non chargé");
    alert("Service vidéo indisponible");
    return;
  }

  // 🔹 UTILISER window.location.origin pour prod
  const API_BASE = window.location.origin;

  try {
    const res = await fetch(`${API_BASE}/api/v1/twilio/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        room: currentRoomId,
        userId: currentUser.id,
      }),
    });

    if (!res.ok) {
      throw new Error(`Erreur HTTP ${res.status} : ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.token) throw new Error("Token Twilio manquant");

    twilioRoom = await Twilio.Video.connect(data.token, {
      name: currentRoomId,
      audio: true,
      video: true,
    });

    const localContainer = document.getElementById("local-video");
    if (localContainer) {
      twilioRoom.localParticipant.tracks.forEach((publication) => {
        if (publication.track) {
          localContainer.appendChild(publication.track.attach());
        }
      });
    }

    const btnExit = document.getElementById("btn-exit-visio");
    if (btnExit) btnExit.style.display = "block";

    console.log("✅ Twilio Video connectée :", currentRoomId);

    attachParticipants(twilioRoom);
    twilioRoom.participants.forEach(attachParticipant);
    twilioRoom.on("participantConnected", attachParticipant);
    twilioRoom.on("participantDisconnected", detachParticipant);

  } catch (err) {
    console.error("❌ Erreur Twilio Video :", err);
    alert("Erreur lors de la connexion à la visio.");
  }
}

// -------------------------------------------------------
// ATTACHER PARTICIPANTS
// -------------------------------------------------------
function attachParticipants(room) {
  if (!room) return;
  room.participants.forEach((participant) => {
    attachParticipant(participant);
  });
}

function attachParticipant(participant) {
  const container = document.getElementById("remote-video");
  if (!container) return;

  participant.tracks.forEach((publication) => {
    if (publication.track) {
      container.appendChild(publication.track.attach());
    }
  });

  participant.on("trackSubscribed", (track) => {
    container.appendChild(track.attach());
  });
}

function detachParticipant(participant) {
  participant.tracks.forEach((publication) => {
    if (publication.track) {
      publication.track.detach().forEach(el => el.remove());
    }
  });
}

// -------------------------------------------------------
// CHAT
// -------------------------------------------------------
function sendChat(e) {
  e.preventDefault();

  const input = document.getElementById("chat-input");
  if (!input || !input.value.trim()) {
    return;
  }

  if (!currentRoomId) {
    alert("Pas en session");
    return;
  }

  if (!ws || ws.readyState !== WebSocket.OPEN) {
    alert("Connexion WebSocket perdue");
    return;
  }

  ws.send(JSON.stringify({
    type: "chatMessage",
    roomId: currentRoomId,
    sender: `${currentUser.prenom} ${currentUser.nom}`,
    text: input.value
  }));

  console.log("💬 Message envoyé :", input.value);
  input.value = "";
}

function renderChat({ sender, text }) {
  const box = document.getElementById("chat-box");
  if (!box) return;

  const div = document.createElement("div");
  div.style.marginBottom = "8px";
  div.style.padding = "6px";
  div.style.backgroundColor = "white";
  div.style.borderRadius = "3px";
  div.style.borderLeft = "3px solid #2563eb";
  div.innerHTML = `<strong>${sender || "Utilisateur"} :</strong> ${text}`;
  box.appendChild(div);

  // Scroller vers le bas
  box.scrollTop = box.scrollHeight;
}

// -------------------------------------------------------
// DOCUMENTS
// -------------------------------------------------------
function sendDocument() {
  if (!currentRoomId) {
    alert("Pas en session");
    return;
  }

  const input = document.getElementById("file-input");
  if (!input || !input.files[0]) {
    alert("Sélectionnez un fichier");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "document",
        roomId: currentRoomId,
        fileName: input.files[0].name,
        fileData: reader.result,
      }));
      input.value = "";
      console.log("📄 Document envoyé :", input.files[0].name);
    }
  };
  reader.readAsDataURL(input.files[0]);
}

function receiveDocument({ fileName, fileData }) {
  const list = document.getElementById("doc-list");
  if (!list) return;

  const a = document.createElement("a");
  a.href = fileData;
  a.download = fileName;
  a.textContent = `📄 ${fileName}`;
  a.className = "doc-link";
  a.style.display = "block";
  a.style.marginBottom = "5px";
  a.style.color = "#2563eb";
  a.style.textDecoration = "none";
  list.appendChild(a);

  console.log("📥 Document reçu :", fileName);
}

// -------------------------------------------------------
// STUBS D'INTÉGRATION UI
// -------------------------------------------------------
function renderStudents(list) {
  console.log("👥 (prof) liste reçue :", list);
}

function showInvoice(data) {
  console.log("🧾 Visio sauvegardée :", data);

  const message = `
📊 FACTURE SESSION
━━━━━━━━━━━━━━━━━
⏱️  Durée: ${data.minutes || 0} minutes
💰 Montant: ${data.amount || 0}€
📌 Statut: ${data.paymentStatus || "pending"}

✅ Session enregistrée avec succès!
  `;

  alert(message);
}
