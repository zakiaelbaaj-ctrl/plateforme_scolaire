// ======================================================
// DASHBOARD PROFESSEUR — UI PURE / DOMAIN-DRIVEN
// ======================================================

import { AppState }          from "/js/core/state.js";
import { SocketService }     from "/js/core/socket.service.js";
import { SessionService }    from "/js/domains/session/session.service.js";
import { CallService }       from "/js/domains/call/call.service.js";
import { ChatService }       from "/js/domains/chat/chat.service.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { DocumentService }   from "/js/domains/document/document.service.js";
import { addDocument }    from "/js/ui/components/document.view.js";
import { appendMessage, resetChat } from "/js/ui/components/chat.view.js";
import { getUserProfile } from "../../services/user.service.js"; // service fictif qui récupère le user connecté

// ================= STRIPE ONBOARDING =================
async function initStripeOnboarding() {
  try {
    // Utiliser l'URL dynamique que nous avons configurée
    const API_URL = window.location.hostname === "localhost" ? "http://localhost:4000" : ""; 
    
    const resp = await fetch(`${API_URL}/api/v1/stripeConnect/onboarding`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}` // 🔐 Crucial pour savoir quel prof onboarder
      },
      credentials: "include"
    });
    
    const data = await resp.json();

    if (data.stripeLink) {
      // Redirige le professeur vers Stripe pour compléter l'onboarding
      window.location.href = data.stripeLink;
    }
  } catch (err) {
    console.error("Erreur Stripe onboarding:", err);
  }
}

// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  // Débloquer l'audio dès la première interaction
  document.addEventListener("click", () => {
    const audio = document.getElementById("incomingCallSound");
    if (audio) { audio.muted = false; audio.play().catch(() => {}); }
  }, { once: true });

  // 🔹 récupérer user via service
  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/professeur/login.html"); // redirection si pas connecté
    return;
  }

  AppState.currentUser = userData;
  AppState.token       = localStorage.getItem("token"); // si tu stockes le token
  AppState.callState   = "idle";

  renderCurrentUserInfo();

  // 🔹 si c'est un professeur, init Stripe onboarding
  if (AppState.currentUser?.role === "professeur") {
    initStripeOnboarding();
  }

  // 🔵 Connexion WebSocket
  SocketService.connect();

  // 🔵 Routing WS → SessionService (un seul point d'entrée)
  SocketService.onMessage((data) => {
    SessionService._handleWs(data);
  });

  bindUI();
  subscribeToDomains();

  // 🔵 Broadcast initial des profs connectés vers les élèves
  updateOnlineProfessors();
});
// ======================================================
// DOMAIN SUBSCRIPTIONS — UI écoute uniquement
// ======================================================

function subscribeToDomains() {

  // ================= SESSION =================
  SessionService.init((event) => {
    if (event.type === "sessionStarted") {
      onSessionStarted(event);
    } else if (event.type === "profConnected" || event.type === "profDisconnected") {
      // 🔵 à chaque changement de prof, on renvoie la liste aux élèves
      updateOnlineProfessors();
    }
  });

  // ================= CALL =================
  CallService.onIncomingCall((data) => showIncomingCall(data));
  CallService.onCallAccepted(() => { hideIncomingAlert(); updateCallStatus("En communication"); setSessionActive(true); });
  CallService.onCallRejected(() => { hideIncomingAlert(); updateCallStatus("Appel refusé"); });
  CallService.onCallEnded(() => cleanupSession("Session terminée"));
  CallService.onLocalTrack((track) => attachLocalVideo(track));
  CallService.onRemoteTracks((tracks) => attachRemoteTracks(tracks));
  CallService.onDisconnected(() => cleanupSession("Déconnexion vidéo"));

  // ================= CHAT =================
  ChatService.onMessage((msg) => renderChat(msg));

  // ================= DOCUMENT =================
  DocumentService.onDocument((doc) => {
    addDocument({
        id:       doc.id ?? doc.fileName,
  name:     doc.fileName ?? doc.name,
  fileData: doc.fileData,
  url:      doc.url ?? doc.fileUrl ?? null
    });
});

  // ================= WHITEBOARD =================
  WhiteboardService.onStroke((stroke) => drawStroke(stroke));
  WhiteboardService.onClear(() => clearCanvas());
  WhiteboardService.onSync((strokes) => {
  clearCanvas();
  for (const s of strokes) drawStroke(s);
  });
  }

// ======================================================
// ONLINE PROFESSORS
// ======================================================

function updateOnlineProfessors() {
  // récupère la liste actuelle des profs connectés
  const profs = SessionService.getOnlineProfessors?.() || [];
  SocketService.send({ type: "onlineProfessors", profs });
}

// ======================================================
// BIND UI — boutons bindés une seule fois
// ======================================================

function bindUI() {

  // ================= BOUTON TERMINER =================
  const endBtn = document.getElementById("end-session-btn");
  endBtn?.addEventListener("click", () => {
    CallService.endCall(); 
    SessionService.endSession();
  });

  // ================= BOUTON STOP VIDÉO =================
  const stopVideoBtn = document.getElementById("stop-video-btn");
  stopVideoBtn?.addEventListener("click", () => endBtn?.click());

  // ================= BOUTONS D'APPEL =================
  let acceptInProgress = false;
  const acceptBtn = document.getElementById("accept-call-btn");
  acceptBtn?.addEventListener("click", () => {
    if (acceptInProgress) return;
    const eleveId = AppState.currentIncomingCallEleveId;
    if (!eleveId) { console.warn("⚠️ Aucun appel à accepter"); return; }
    acceptInProgress = true;
    SocketService.send({ type: "acceptCall", eleveId });
    AppState.currentIncomingCallEleveId = null;
    hideIncomingAlert();
    setTimeout(() => { acceptInProgress = false; }, 5000);
  });

  const cancelBtn = document.getElementById("cancel-call-btn");
  cancelBtn?.addEventListener("click", () => {
    const eleveId = AppState.currentIncomingCallEleveId;
    if (!eleveId) return;
    SocketService.send({ type: "rejectCall", eleveId });
    AppState.currentIncomingCallEleveId = null;
    hideIncomingAlert();
    updateCallStatus("Appel refusé");
  });

  // ================= WHITEBOARD =================
  document.getElementById("undoWhiteboardBtn")?.addEventListener("click", () => WhiteboardService.undo());
  document.getElementById("clearWhiteboardBtn")?.addEventListener("click",    () => WhiteboardService.clearBoard());
  document.getElementById("downloadWhiteboardBtn")?.addEventListener("click", () => WhiteboardService.download?.());
  document.getElementById("penToolBtn")?.addEventListener("click",    () => setWbTool("penToolBtn",    () => WhiteboardService.setTool?.("pen")));
  document.getElementById("eraserToolBtn")?.addEventListener("click", () => setWbTool("eraserToolBtn", () => WhiteboardService.setTool?.("eraser")));
  document.getElementById("lineToolBtn")?.addEventListener("click",   () => setWbTool("lineToolBtn",   () => WhiteboardService.setTool?.("line")));
  document.getElementById("rectToolBtn")?.addEventListener("click",   () => setWbTool("rectToolBtn",   () => WhiteboardService.setTool?.("rect")));
  document.getElementById("textToolBtn")?.addEventListener("click",   () => setWbTool("textToolBtn",   () => WhiteboardService.setTool?.("text")));
  document.getElementById("wb-fullscreen-btn")?.addEventListener("click", toggleWhiteboardFullscreen);

  // ================= CHAT =================
  document.getElementById("send-msg")?.addEventListener("click", sendChat);
  document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendChat(); }
  });

  // ================= DOCUMENTS =================
  document.getElementById("send-file")?.addEventListener("click", sendDocument);

  // ================= VISIO =================
  document.getElementById("toggle-video-btn")?.addEventListener("click", toggleVideo);
  document.getElementById("toggle-camera-btn")?.addEventListener("click", toggleCamera);

  // ================= LOGOUT =================
  document.getElementById("logout-btn")?.addEventListener("click", () => {
    SessionService.stopVideoCall?.();
    localStorage.clear();
    window.location.href = "/pages/professeur/login.html";
  });
}

// ======================================================
// SESSION UI
// ======================================================

function onSessionStarted(event) {
  AppState.sessionInProgress = true;
  AppState.currentRoomId     = event.roomId;

  updateCallStatus("En communication");
  setSessionActive(true);
  WhiteboardService.initCanvas("whiteboard-canvas", event.roomId);

  const remoteInfo = document.getElementById("remote-eleve-info");
  if (remoteInfo) remoteInfo.style.display = "none";

  SessionService.startTimer?.(updateTimerUI);
}

function setSessionActive(active) {
  const endBtn     = document.getElementById("end-session-btn");
  const toggleBtn  = document.getElementById("toggle-video-btn");
  const stopBtn    = document.getElementById("stop-video-btn");
  const badge      = document.getElementById("session-badge");

  [endBtn, toggleBtn, stopBtn].forEach(btn => { if (btn) btn.style.display = active ? "" : "none"; });
  if (badge) badge.classList.toggle("active", active);
}

function cleanupSession(message) {
  CallService.disconnectTwilio();
  AppState.callState         = "idle";
  AppState.sessionInProgress = false;
  SessionService.stopTimer?.();
  setSessionActive(false);
  updateCallStatus(message);
  WhiteboardService.reset?.();

  ["remoteVideo", "localVideo"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.srcObject = null;
  });

  const remoteInfo = document.getElementById("remote-eleve-info");
  if (remoteInfo) { remoteInfo.textContent = "En attente d'un élève…"; remoteInfo.style.display = ""; }

  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";
  resetChat();
  clearCanvas();
}

// ======================================================
// CALL UI
// ======================================================

function showIncomingCall({ eleveId, eleveName, eleveVille, elevePays }) {
  AppState.currentIncomingCallEleveId = eleveId ?? null;
  const audio = document.getElementById("incomingCallSound");
  audio?.play().catch(() => {});
  const box  = document.getElementById("incoming-call-box");
  const text = document.getElementById("incoming-call-text");
  const noCall = document.getElementById("no-call");
  if (box)    box.style.display    = "flex";
  if (noCall) noCall.style.display = "none";
  if (text) {
    const location = eleveVille && elevePays ? ` — ${eleveVille}, ${elevePays}` : "";
    text.textContent = `${eleveName || "Élève"}${location}`;
  }
}

function hideIncomingAlert() {
  const box    = document.getElementById("incoming-call-box");
  const noCall = document.getElementById("no-call");
  if (box)    box.style.display    = "none";
  if (noCall) noCall.style.display = "flex";
}

// ======================================================
// VIDEO TRACKS
// ======================================================

function attachLocalVideo(track) {
  const container = document.getElementById("localVideo");
  if (!container || track.kind !== "video") return;
  const el = track.attach();
  el.autoplay = true;
  el.playsInline = true;
  el.muted = true;
  container.replaceWith(el);
  el.id = "localVideo";
}

function attachRemoteTracks(tracks) {
  tracks?.forEach(track => {
    if (track.kind === "video") {
      const container = document.getElementById("remoteVideo");
      if (!container) return;
      const el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      container.replaceWith(el);
      el.id = "remoteVideo";
    }
    if (track.kind === "audio") {
      const audio = track.attach();
      audio.autoplay = true;
      audio.muted = false;
      document.body.appendChild(audio);
    }
  });
}

function toggleVideo() {
  AppState.twilioRoom?.localParticipant?.videoTracks?.forEach(pub => pub.track.isEnabled ? pub.track.disable() : pub.track.enable());
}

function toggleCamera() {
  AppState.twilioRoom?.localParticipant?.videoTracks?.forEach(pub => pub.track.isEnabled ? pub.track.disable() : pub.track.enable());
}

// ======================================================
// TIMER UI
// ======================================================

function updateTimerUI(time) {
  const el = document.getElementById("call-time");
  if (el) el.textContent = time;
}

// ======================================================
// CHAT UI
// ======================================================

function sendChat() {
  const input = document.getElementById("chat-input");
  if (!input?.value.trim()) return;
  ChatService.send(input.value.trim());
  input.value = "";
}

function renderChat({ sender, text }) {
  appendMessage(sender, text, false); // ✅
}

// ======================================================
// DOCUMENT UI
// ======================================================

function sendDocument() {
  const input = document.getElementById("file-input");
  if (!input?.files?.[0]) return;
  SessionService.sendDocument(input.files[0]);
}

// ======================================================
// WHITEBOARD UI
// ======================================================

function drawStroke(stroke) {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = stroke.color || "#000";
  ctx.lineWidth   = stroke.size  || 3;
  ctx.lineCap     = "round";

  if (stroke.type === "start") {
    ctx.beginPath();
    ctx.moveTo(stroke.x, stroke.y);
  } else if (stroke.type === "move") {
    ctx.lineTo(stroke.x, stroke.y);
    ctx.stroke();
  }
}
function clearCanvas() {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function setWbTool(activeId, callback) {
  document.querySelectorAll(".wb-tool").forEach(btn => btn.classList.remove("active"));
  document.getElementById(activeId)?.classList.add("active");
  callback();
}

function toggleWhiteboardFullscreen() {
  const wrapper = document.getElementById("whiteboard-wrapper");
  if (!wrapper) return;
  wrapper.classList.toggle("whiteboard-fullscreen");
  WhiteboardService.resizeCanvas?.();
}

// ======================================================
// UI HELPERS
// ======================================================

function updateCallStatus(text) {
  const el = document.getElementById("call-status");
  if (el) el.textContent = text;
}

function renderCurrentUserInfo() {
  const { prenom, nom, ville, pays } = AppState.currentUser || {};
  const nameEl = document.getElementById("prof-name");
  const locEl  = document.getElementById("prof-location");
  if (nameEl) nameEl.textContent = `${prenom ?? ""} ${nom ?? ""}`.trim();
  if (locEl)  locEl.textContent  = ville && pays ? `${ville}, ${pays}` : "";
}