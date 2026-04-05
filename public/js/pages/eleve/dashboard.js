// ======================================================
// DASHBOARD ÉLÈVE — UI PURE
// ======================================================

import { AppState }          from "/js/core/state.js";
import { SocketService }     from "/js/core/socket.service.js";
import { SessionService }    from "/js/domains/session/session.service.js";
import { ChatService }       from "/js/domains/chat/chat.service.js";
import { CallService }       from "/js/domains/call/call.service.js";
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { appendMessage, resetChat } from "/js/ui/components/chat.view.js";
import { DocumentService } from "/js/domains/document/document.service.js";
import { addDocument } from "/js/ui/components/document.view.js";
import { getUserProfile } from "../../services/user.service.js";
/// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/eleve/login.html"); 
    return;
  }

  AppState.currentUser = userData;
  AppState.token = localStorage.getItem("token") || null;
  AppState.callState = "idle";

  renderCurrentUserInfo();

  // 🔵 Connexion WebSocket
  // Le SocketService utilisera l'URL dynamique que nous avons corrigée ensemble
  SocketService.connect();
  
  SocketService.onMessage((data) => {
    SessionService._handleWs(data);
  });

  bindUI();
  subscribeToDomains();
});

// ======================================================
// DOMAIN SUBSCRIPTIONS
// ======================================================

    function subscribeToDomains() {

  // ================= SESSION =================
   SessionService.init((event) => {
  if (event.type === "onlineProfessors") {
    renderProfList(event.profs);
  }

  if (event.type === "sessionStarted") {
    WhiteboardService.initCanvas("whiteboard-canvas", event.roomId);
  }

  // ⚡ Gestion utilisateur qui quitte
  if (event.type === "userLeft") {
    const listEl = document.getElementById("remote-users");
    if (!listEl) return;
    const el = listEl.querySelector(`[data-user-id="${event.userId}"]`);
    if (el) el.remove();
    updateCallStatus(`${event.userName || "Utilisateur"} a quitté la session`);
  }
});

  // ================= CHAT =================
  // ✅ Un seul abonnement, ici, avec appendMessage
  ChatService.onMessage((msg) => {
    appendMessage(msg.sender, msg.text);
  });

  // ================= WHITEBOARD =================
  WhiteboardService.onStroke((stroke) => {
    drawStroke(stroke);
  });

  WhiteboardService.onClear(() => {
    clearCanvas();
  });
  WhiteboardService.onSync((strokes) => {
  clearCanvas();
  for (const s of strokes) drawStroke(s);
});

WhiteboardService.onText((textStroke) => {
  drawText(textStroke);
});

  // ================= CALL =================
  CallService.onCallSent(() => {
    updateCallStatus("Appel en cours…");
  });

  CallService.onCallAccepted(() => {
  updateCallStatus("Connexion en cours…");
  });

   CallService.onConnected(() => {
  updateCallStatus("En communication");
  SessionService.startTimer?.(updateTimerUI);
 });
  CallService.onCallRejected(() => {
    updateCallStatus("Appel refusé");
  });

  CallService.onCallEnded(() => {
    cleanupSession("Session terminée");
  });

  CallService.onLocalTrack((track) => {
    attachLocalVideo(track);
  });

  CallService.onRemoteTracks((tracks) => {
    attachRemoteTracks(tracks);
  });

  CallService.onDisconnected(() => {
    cleanupSession("Déconnexion vidéo");
  });
  DocumentService.onDocument((doc) => {
    console.log("📄 doc.fileData:", doc.fileData?.substring(0, 50)); 
    addDocument({
       id:       doc.id ?? doc.fileName,
  name:     doc.fileName ?? doc.name,
  fileData: doc.fileData,
  url:      doc.url ?? doc.fileUrl ?? null
      });
});
}
// ======================================================
// BIND UI
// ======================================================

function bindUI() {

  document.getElementById("send-msg")?.addEventListener("click", sendChat);

  document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendChat();
  });

  document.getElementById("send-file")?.addEventListener("click", sendDocument);

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    CallService.disconnectTwilio();
    localStorage.clear();
    window.location.href = "/pages/eleve/login.html";
  });

  document.getElementById("wb-fullscreen-btn")?.addEventListener("click", toggleWhiteboardFullscreen);

  document.getElementById("end-session-btn")?.addEventListener("click", () => {
  CallService.endCall(); // informe le serveur
  SessionService.endSession();
});
// ================= WHITEBOARD =================
document.getElementById("undoWhiteboardBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  WhiteboardService.undo();
});

document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  WhiteboardService.clearBoard();
});

document.getElementById("downloadWhiteboardBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  WhiteboardService.download?.();
});

document.getElementById("penToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  setWbTool("penToolBtn", () => WhiteboardService.setTool?.("pen"));
});

document.getElementById("eraserToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  setWbTool("eraserToolBtn", () => WhiteboardService.setTool?.("eraser"));
});

document.getElementById("lineToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  setWbTool("lineToolBtn", () => WhiteboardService.setTool?.("line"));
});

document.getElementById("rectToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  setWbTool("rectToolBtn", () => WhiteboardService.setTool?.("rect"));
});

document.getElementById("textToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return; 
  setWbTool("textToolBtn", () => WhiteboardService.setTool?.("text"));
});

document.getElementById("wb-fullscreen-btn")?.addEventListener("click", toggleWhiteboardFullscreen);
}
// ======================================================
// CHAT
// ======================================================

function sendChat() {
  const input = document.getElementById("chat-input");
  if (!input?.value) return;

  ChatService.send(input.value);
  input.value = "";
}


// ======================================================
// PROF LIST
// ======================================================

function renderProfList(profs = []) {
  const list = document.getElementById("prof-list");
  if (!list) return;

  list.innerHTML = "";

  if (!profs.length) {
    list.innerHTML = `<li class="empty">Aucun professeur connecté</li>`;
    return;
  }

  profs.forEach(prof => {
    const li   = document.createElement("li");
    li.className = "prof-item";

    // ✅ textContent — plus de XSS
    const span = document.createElement("span");
    span.textContent = `${prof.prenom} ${prof.nom}`;

    const btn  = document.createElement("button");
    btn.className   = "call-prof-btn";
    btn.textContent = "Appeler";
    btn.addEventListener("click", () => {
      SessionService.callProfessor(prof.id);
    });

    li.appendChild(span);
    li.appendChild(btn);
    list.appendChild(li);
  });
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
// WHITEBOARD UI
// ======================================================

function drawStroke(stroke) {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth   = stroke.size;
  ctx.lineCap     = "round";

  if (stroke.type === "start") {
    ctx.beginPath();
    ctx.moveTo(stroke.x, stroke.y);
  } else if (stroke.type === "move") {
    ctx.lineTo(stroke.x, stroke.y);
    ctx.stroke();
  }
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

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function toggleWhiteboardFullscreen() {
  const wrapper = document.getElementById("whiteboard-wrapper");
  if (!wrapper) return;

  wrapper.classList.toggle("whiteboard-fullscreen");
  WhiteboardService.resizeCanvas?.();
}


// ======================================================
// CALL UI
// ======================================================

function attachLocalVideo(track) {
  const container = document.getElementById("localVideoContainer"); // Utilisez un conteneur parent
  if (!container || track.kind !== "video") return;

  const el = track.attach();
  el.autoplay = true;
  el.playsInline = true;
  el.muted = true;
  el.style.width = "100%"; // Optionnel : force la taille
  el.id = "localVideo";

  container.innerHTML = ""; // On vide l'ancien flux
  container.appendChild(el);
}

function attachRemoteTracks(tracks) {
  tracks?.forEach(track => {
    if (track.kind === "video") {
      const container = document.getElementById("remoteVideoContainer");
      if (!container) return;

      const el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      el.id = "remoteVideo";

      container.innerHTML = ""; 
      container.appendChild(el);
    }

    if (track.kind === "audio") {
      const audio = track.attach();
      audio.autoplay = true;
      document.body.appendChild(audio);
    }
  });
}

function updateCallStatus(text) {
  const el = document.getElementById("call-status");
  if (el) el.textContent = text;
}

// ======================================================
// CLEANUP - Correction pour éviter les erreurs null
// ======================================================

function cleanupSession(message) {
  CallService.disconnectTwilio();
  SessionService.stopTimer?.();

  updateCallStatus(message);
  
  // On vide les conteneurs vidéo
  const remote = document.getElementById("remoteVideoContainer");
  const local = document.getElementById("localVideoContainer");

  if (remote) remote.innerHTML = "En attente du professeur...";
  if (local) local.innerHTML = "";

  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";
  
  WhiteboardService.reset?.();
  resetChat();
}
// ✅ Ajouter avant la dernière fonction renderCurrentUserInfo
function updateTimerUI(time) {
  const el = document.getElementById("call-time");
  if (el) el.textContent = time;
}
function updateToolButtons() {
  document.querySelectorAll(".wb-tool").forEach(btn => {
    btn.disabled = !AppState.canUseTools;
  });
}
// ======================================================
// USER INFO
// ======================================================

function renderCurrentUserInfo() {
  if (!AppState.currentUser) return;
  
  const { prenom, nom, ville, pays } = AppState.currentUser;
  const nameEl = document.getElementById("eleve-name");
  const cityEl = document.getElementById("eleve-location");

  if (nameEl) nameEl.textContent = `${prenom || ""} ${nom || ""}`.trim();
  if (cityEl) cityEl.textContent = (ville && pays) ? `${ville}, ${pays}` : (ville || pays || "");
}