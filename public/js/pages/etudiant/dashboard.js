// ======================================================
// DASHBOARD ÉTUDIANT — UI PURE / DOMAIN-DRIVEN
// ======================================================

import { AppState } from "/js/core/state.js";
import { SocketService } from "/js/core/socket.service.js";
import { SessionService } from "/js/domains/session/session.service.js";
import { CallService } from "/js/domains/call/call.service.js";
import { ChatService } from "/js/domains/chat/chat.service.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { DocumentService } from "/js/domains/document/document.service.js";
import { appendMessage, resetChat } from "/js/ui/components/chat.view.js";
import { addDocument } from "/js/ui/components/document.view.js";
import { getUserProfile } from "../../services/user.service.js"; // service fictif
import { initStripeOnboarding } from "../../services/stripe.service.js"; // service fictif Stripe

// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 🔹 Récupérer le user via service
  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/etudiant/login.html");
    return;
  }

  AppState.currentUser = userData;
  AppState.token = localStorage.getItem("token") || null;
  AppState.callState = "idle";
  AppState.sessionInProgress = false;
  AppState.currentRoomId = null;
  AppState.currentSessionType = null; // "eleve" ou "prof"
  AppState.canUseTools = false;

  renderStudentInfo();

  // 🔹 Si le user est prof, init Stripe
  if (AppState.currentUser.role === "professeur") {
    await initStripeOnboarding();
  }

  // 🔹 Connect WebSocket
  SocketService.connect();
  SocketService.onMessage((data) => SessionService._handleWs(data));

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
  CallService.onCallSent(() => updateStatus("Appel en cours…"));
  CallService.onCallAccepted(() => updateStatus("Connexion en cours…"));
  CallService.onConnected(() => updateStatus("En communication"));
  CallService.onCallRejected(() => updateStatus("Appel refusé"));
  CallService.onCallEnded(() => cleanupSession("Session terminée"));
  CallService.onLocalTrack(attachLocalVideo);
  CallService.onRemoteTracks(attachRemoteTracks);
  CallService.onDisconnected(() => cleanupSession("Déconnexion vidéo"));
}

// ======================================================
// UI BINDING
// ======================================================
function bindUI() {
  // 🔹 Start matching P2P par matière
  document.getElementById("start-session-btn")?.addEventListener("click", () => {
    const subjectId = document.getElementById("subject-select")?.value;
    startMatching(subjectId);
  });

  // 🔹 Chat
  document.getElementById("send-msg")?.addEventListener("click", sendChat);
  document.getElementById("chat-input")?.addEventListener("keydown", e => { if (e.key === "Enter") sendChat(); });

  // 🔹 Documents
  document.getElementById("send-file")?.addEventListener("click", sendDocument);

  // 🔹 Whiteboard tools
  bindWhiteboardTools();

  // 🔹 Logout
  document.getElementById("logout-btn")?.addEventListener("click", logout);

  // 🔹 End session
  document.getElementById("end-session-btn")?.addEventListener("click", () => {
    CallService.endCall();
    SessionService.endSession();
  });
}

// ======================================================
// MATCHING & CALL
// ======================================================
async function startMatching(subjectId) {
  if (!subjectId) return;
  AppState.currentSessionType = "eleve";
  updateStatus("Recherche d'étudiant disponible...");
  try {
    await SessionService.requestStudentMatch(subjectId);
  } catch (err) {
    console.error(err);
    updateStatus("Impossible de trouver un étudiant pour le moment");
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
  const container = document.getElementById("localVideo");
  if (!container || track.kind !== "video") return;
  const el = track.attach(); el.autoplay = true; el.playsInline = true; el.muted = true;
  container.replaceWith(el); el.id = "localVideo";
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
// SESSION / UI HELPERS
// ======================================================
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
  const { prenom, nom, ville, pays, abonnement } = AppState.currentUser || {};
  document.getElementById("eleve-name").textContent = `${prenom} ${nom}`;
  document.getElementById("eleve-location").textContent = ville && pays ? `${ville}, ${pays}` : "";
  document.getElementById("eleve-abonnement").textContent = abonnement || "Non défini";
}

// ======================================================
// PROF / STUDENT LIST UI
// ======================================================
function renderProfList(profs = []) {
  const list = document.getElementById("prof-list");
  if (!list) return;
  list.innerHTML = "";
  profs.forEach(prof => {
    const li = document.createElement("li");
    li.textContent = `${prof.prenom} ${prof.nom}`;
    const btn = document.createElement("button");
    btn.textContent = "Appeler";
    btn.addEventListener("click", () => callProfessor(prof.id));
    li.appendChild(btn);
    list.appendChild(li);
  });
}

function renderStudentList(students = []) {
  const list = document.getElementById("student-list");
  if (!list) return;
  list.innerHTML = "";
  students.forEach(stu => {
    const li = document.createElement("li");
    li.textContent = `${stu.prenom} ${stu.nom} (${stu.matiere})`;
    const btn = document.createElement("button");
    btn.textContent = "Appeler";
    btn.addEventListener("click", () => SessionService.callStudent(stu.id));
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
  updateStatus(`${userName || "Utilisateur"} a quitté la session`);
}

// ======================================================
// LOGOUT
// ======================================================
function logout() {
  CallService.disconnectTwilio();
  localStorage.clear();
  window.location.href = "/pages/etudiant/login.html";
}