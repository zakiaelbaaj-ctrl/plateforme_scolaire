// ======================================================
// DASHBOARD ETUDIANT _ UI PURE / DOMAIN-DRIVEN
// ======================================================

import { AppState }          from "/js/core/state.js";
import { socketService }     from "/js/core/socket.service.js";
import { SessionService }    from "/js/domains/session/session.service.js";
import { ChatService }       from "/js/domains/chat/chat.service.js";
import { CallService }       from "/js/domains/call/call.service.js";
import { VideoService }      from "/js/domains/call/video.service.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { appendMessage, resetChat } from "/js/ui/components/chat.view.js";
import { DocumentService } from "/js/domains/document/document.service.js";
import { addDocument } from "/js/ui/components/document.view.js";
import { initUIRenderers } from "/js/modules/ui/uiRenderers.js";
import { socketHandlerEleve } from "/js/core/socket.handler.eleve.js";
import { getUserProfile } from "../../services/user.service.js";
import { handleAllStripeReturns, holdFundsForSession } 
from "/js/services/stripe.service.js";
import { initStripeOnboarding } from "/js/services/stripe.service.js";
import { openSetupSession } from "/js/services/stripe.service.js";
// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  // ðŸ”¹ RÃ©cupÃ©rer le user via service
  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/etudiant/login.html");
    return;
  }

  AppState.currentUser = userData;
  AppState.token = localStorage.getItem("token") || null;
  AppState.setCallState(null);
  AppState.sessionInProgress = false;
  AppState.currentRoomId = null;
  AppState.currentSessionType = null; // "eleve" ou "prof"
  AppState.canUseTools = false;

  renderStudentInfo();

  // 🔹 Connect WebSocket
  const token = localStorage.getItem("token");
  const WS_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
  ? `ws://localhost:4000?token=${token}`
  : `wss://plateforme-scolaire-1.onrender.com?token=${token}`;

  socketService.connect(WS_URL);
  socketService.onMessage((data) => SessionService._handleWs(data));

  bindUI();
  subscribeToDomains();
});

// ======================================================
// DOMAIN SUBSCRIPTIONS
// ======================================================
function subscribeToDomains() {

  // ================= SESSION =================
  SessionService.init(event => {
    switch (event.type) {
      case "onlineProfessors":
        renderProfList(event.profs);
        break;
      case "onlineStudents":
        renderStudentList(event.students);
        break;
      case "sessionStarted":
        AppState.sessionInProgress = true;
        AppState.currentRoomId = event.roomId;
        AppState.currentSessionType = event.sessionType; // "eleve" ou "prof"
        WhiteboardService.initCanvas("whiteboard-canvas", event.roomId);
        updateStatus("Session active");
        SessionService.startTimer?.(updateTimerUI);
        break;
      case "userLeft":
        removeUserFromList(event.userId, event.userName);
        break;
    }
  });

  // ================= CHAT =================
  ChatService.onMessage(msg => appendMessage(msg.sender, msg.text));

  // ================= DOCUMENT =================
  DocumentService.onDocument(doc => {
    addDocument({
      id: doc.id ?? doc.fileName,
      name: doc.fileName ?? doc.name,
      fileData: doc.fileData,
      url: doc.url ?? doc.fileUrl ?? null
    });
  });

  // ================= WHITEBOARD =================
  WhiteboardService.onStroke(drawStroke);
  WhiteboardService.onText(drawText);
  WhiteboardService.onClear(clearCanvas);
  WhiteboardService.onSync(strokes => {
    clearCanvas();
    strokes.forEach(drawStroke);
  });

  // ================= CALL =================
  CallService.onCallSent(() => updateStatus("Appel en coursâ€¦"));
  CallService.onCallAccepted(() => updateStatus("Connexion en coursâ€¦"));
  CallService.onConnected(() => updateStatus("En communication"));
  CallService.onCallRejected(() => updateStatus("Appel refusÃ©"));
  CallService.onCallEnded(() => cleanupSession("Session terminÃ©e"));
  CallService.onLocalTrack(attachLocalVideo);
  CallService.onRemoteTracks(attachRemoteTracks);
  CallService.onDisconnected(() => cleanupSession("DÃ©connexion vidÃ©o"));
}

// ======================================================
// UI BINDING
// ======================================================
function bindUI() {
  //  Start matching P2P par matiÃ¨re
 document.getElementById("start-session-btn")?.addEventListener("click", () => {
  const subjectId = document.getElementById("matiere")?.value; // Utilise l'ID 'matiere'
  startMatching(subjectId);
});
  //  Chat
  document.getElementById("send-msg")?.addEventListener("click", sendChat);
  document.getElementById("chat-input")?.addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

  // Documents
  document.getElementById("send-file")?.addEventListener("click", sendDocument);

  // Whiteboard tools
  bindWhiteboardTools();

  //  Logout
  document.getElementById("logout-btn")?.addEventListener("click", logout);

  // End session
  document.getElementById("end-session-btn")?.addEventListener("click", () => {
    CallService.endCall();
    SessionService.endSession();
  });
  // Gestion du bouton Rejoindre
  document.getElementById("btn-rejoindre-cours")?.addEventListener("click", () => {
    handleJoinCall();
  });
}

// ======================================================
// MATCHING & CALL
// ======================================================
async function startMatching(subjectId) {
  if (!subjectId) return;
  AppState.currentSessionType = "eleve";
  updateStatus("Recherche d'Ã©tudiant disponible...");
  try {
    await SessionService.requestStudentMatch(subjectId);
  } catch (err) {
    console.error(err);
    updateStatus("Impossible de trouver un Ã©tudiant pour le moment");
  }
}

function callProfessor(profId) {
  if (!profId) return;
  AppState.currentSessionType = "prof";
  SessionService.callProfessor(profId);
  updateStatus("Appel en cours avec le professeur...");
}

// ======================================================
// CHAT
// ======================================================
function sendChat() {
  const input = document.getElementById("chat-input");
  if (!input?.value.trim()) return;
  ChatService.send(input.value.trim());
  input.value = "";
}

// ======================================================
// DOCUMENT
// ======================================================
function sendDocument() {
  const input = document.getElementById("file-input");
  if (!input?.files?.[0]) return;
  SessionService.sendDocument(input.files[0]);
}

// ======================================================
// WHITEBOARD
// ======================================================
function drawStroke(stroke) {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  if (stroke.type === "start") ctx.beginPath(), ctx.moveTo(stroke.x, stroke.y);
  else if (stroke.type === "move") ctx.lineTo(stroke.x, stroke.y), ctx.stroke();
}

function drawText(textStroke) {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = textStroke.color;
  ctx.font = `${textStroke.size * 5}px sans-serif`;
  ctx.fillText(textStroke.text, textStroke.x, textStroke.y);
}

function clearCanvas() {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function bindWhiteboardTools() {
  const tools = ["pen", "eraser", "line", "rect", "text"];
  tools.forEach(tool => {
    document.getElementById(`${tool}ToolBtn`)?.addEventListener("click", () => {
      if (!AppState.canUseTools) return;
      WhiteboardService.setTool?.(tool);
    });
  });
  document.getElementById("undoWhiteboardBtn")?.addEventListener("click", () => AppState.canUseTools && WhiteboardService.undo());
  document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => AppState.canUseTools && WhiteboardService.clearBoard());
  document.getElementById("downloadWhiteboardBtn")?.addEventListener("click", () => AppState.canUseTools && WhiteboardService.download?.());
}

// ======================================================
// VIDEO / CALL
// ======================================================
function attachLocalVideo(track) {
  const container = document.getElementById("localVideoContainer");
  if (!container || track.kind !== "video") return;
  const el = track.attach(); 
  el.style.width = "100%"; // Optionnel pour le responsive
  container.innerHTML = ""; // Vide le "CAM" par défaut
  container.appendChild(el);
}

function attachRemoteTracks(tracks) {
  tracks?.forEach(track => {
    if (track.kind === "video") {
      const container = document.getElementById("remoteVideo");
      if (!container) return;
      const el = track.attach(); el.autoplay = true; el.playsInline = true;
      container.replaceWith(el); el.id = "remoteVideo";
    }
    if (track.kind === "audio") {
      const audio = track.attach(); audio.autoplay = true; document.body.appendChild(audio);
    }
  });
}
// ======================================================
// GESTION DE L'APPEL (Version adaptée à ton CallService)
// ======================================================
 function joinTwilioSession() {
  const roomId = AppState.currentRoomId;
  
  if (!roomId) {
    updateStatus("Aucune session active à rejoindre.");
    return;
  }

  // Mise à jour de l'UI
    const btn = document.getElementById("btn-rejoindre-cours");

if (btn) {
    // 1. Désactive le bouton pour éviter les clics multiples (spam)
    btn.disabled = true; 
    
    // 2. Ajoute une classe CSS pour le style "chargement" (optionnel)
    btn.classList.add("btn--loading"); 
    
    // 3. Change le texte de manière propre
    btn.innerHTML = `<span>⌛ Connexion...</span>`;
    
    // 4. Accessibilité : on indique aux lecteurs d'écran que c'est en cours
    btn.setAttribute("aria-busy", "true");
}

  updateStatus("Demande d'accès au flux vidéo...");

  // On demande le token au serveur. 
  // La réponse sera traitée par CallService.handleEvent (case "twilioToken")
  socketService.send({
    type: "requestTwilioToken",
    roomId: roomId
  });
}
// ======================================================
// SESSION / UI HELPERS
// ======================================================

// À placer dans la section UI HELPERS de dashboard.js
function resetJoinButton() {
    const btn = document.getElementById("btn-rejoindre-cours");
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = "▶ Rejoindre"; // On remet le texte d'origine
        btn.classList.remove("btn--loading");
        btn.removeAttribute("aria-busy"); // Plus propre que "false"
    }
}

// ✅ INDISPENSABLE : On la rend disponible pour VideoService.js
window.resetJoinButton = resetJoinButton;
function cleanupSession(message) {
  CallService.disconnectTwilio();
  SessionService.stopTimer?.();
  AppState.sessionInProgress = false;
  AppState.currentRoomId = null;
  AppState.currentSessionType = null;
  updateStatus(message);
  WhiteboardService.reset?.();
  resetChat();
  const remote = document.getElementById("remoteVideo");
  const local = document.getElementById("localVideo");
  if (remote) remote.srcObject = null;
  if (local) local.srcObject = null;
}

function updateStatus(text) {
  const el = document.getElementById("call-status");
  if (el) el.textContent = text;
}

function updateTimerUI(time) {
  const el = document.getElementById("call-time");
  if (el) el.textContent = time;
}

// ======================================================
// USER INFO
// ======================================================
 function renderStudentInfo() {
  const { prenom, nom, ville, pays } = AppState.currentUser || {};
  document.getElementById("student-info").textContent = `${prenom} ${nom}`;
  document.getElementById("etudiant-location").textContent = ville && pays ? `${ville}, ${pays}` : "";
}
// ======================================================
// PROF / STUDENT LIST UI
// ======================================================
function renderStudentList(etudiants = []) {
  const list = document.getElementById("etudiant-list");
  if (!list) return;
  list.innerHTML = "";

  // ✅ Récupérer la matière de l'étudiant connecté
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const matiereEtudiant = currentUser.matiere || localStorage.getItem("matiere") || "";

  // ✅ Filtrer les étudiants par même matière
  const etudiantsFiltres = matiereEtudiant
    ? etudiants.filter(e => e.matiere === matiereEtudiant)
    : etudiants;

  if (!etudiantsFiltres.length) {
    list.innerHTML = `<li class='empty'>Aucun étudiant disponible en ${matiereEtudiant || "cette matière"}</li>`;
    return;
  }

  etudiantsFiltres.forEach(etudiant => {
    const li = document.createElement("li");
    li.textContent = `${etudiant.prenom} ${etudiant.nom} — ${etudiant.matiere}`;
    li.dataset.userId = etudiant.id;
    const btn = document.createElement("button");
    btn.textContent = "Travailler ensemble";
    btn.addEventListener("click", () => startMatching(etudiant.matiere));
    li.appendChild(btn);
    list.appendChild(li);
  });
}
function renderProfList(profs = []) {
  const list = document.getElementById("prof-list");
  if (!list) return;
  list.innerHTML = "";

  // ✅ Récupérer la matière de l'étudiant connecté
  const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
  const matiereEtudiant = currentUser.matiere || localStorage.getItem("matiere") || "";

  // ✅ Filtrer les profs par matière
  const profsFiltres = matiereEtudiant
    ? profs.filter(prof => prof.matiere === matiereEtudiant)
    : profs;

  if (!profsFiltres.length) {
    list.innerHTML = `<li class='empty'>Aucun professeur disponible en ${matiereEtudiant || "cette matière"}</li>`;
    return;
  }

  profsFiltres.forEach(prof => {
    const li = document.createElement("li");
    li.textContent = `${prof.prenom} ${prof.nom} — ${prof.matiere}`;
    li.dataset.userId = prof.id;
    const btn = document.createElement("button");
    btn.textContent = "Appeler";
    btn.addEventListener("click", () => callProfessor(prof.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}
function removeUserFromList(userId, userName) {
  ["prof-list", "student-list"].forEach(listId => {
    const list = document.getElementById(listId);
    if (!list) return;
    const el = list.querySelector(`[data-user-id="${userId}"]`);
    if (el) el.remove();
  });
  updateStatus(`${userName || "Utilisateur"} a quittÃ© la session`);
}

// ======================================================
// LOGOUT
// ======================================================
function logout() {
  CallService.disconnectTwilio();
  localStorage.clear();
  window.location.href = "/pages/etudiant/login.html";
}

