// ======================================================
// DASHBOARD PROFESSEUR _ UI PURE / DOMAIN-DRIVEN
// ======================================================

import { AppState }          from "/js/core/state.js";
import { socketService }     from "/js/core/socket.service.js";
import { SessionService }    from "/js/domains/session/session.service.js";
import { CallService }       from "/js/domains/call/call.service.js";
import { VideoService }      from "/js/domains/call/video.service.js";
import { ChatService }       from "/js/domains/chat/chat.service.js";
import { WhiteboardService } from "../../domains/whiteboard/whiteboard.service.js";
import { DocumentService }   from "/js/domains/document/document.service.js";
import { addDocument }    from "/js/ui/components/document.view.js";
import { appendMessage, resetChat } from "/js/ui/components/chat.view.js";
import { socketHandlerProf } from "/js/core/socket.handler.js";
import { getUserProfile } from "../../services/user.service.js"; // service fictif qui rÃ©cupÃ¨re le user connectÃ©
import { handleAllStripeReturns, openSetupSession } from '/js/services/stripe.service.js';
const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

const API_BASE = `${API_URL}/api/v1`;
// ================= STRIPE ONBOARDING =================
async function initStripeOnboarding() {
  try {
    // On utilise API_BASE qui est dÃ©finie en haut du fichier
    const resp = await fetch(`${API_BASE}/stripeConnect/onboarding`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      }
    });
    
    const data = await resp.json();

    if (data.stripeLink) {
      window.location.href = data.stripeLink;
    } else {
      // Ajout d'une alerte si le lien est absent (trÃ¨s utile pour le dÃ©bug)
      alert("Erreur : " + (data.message || "Impossible de gÃ©nÃ©rer le lien Stripe."));
    }
  } catch (err) {
    console.error("Erreur Stripe onboarding:", err);
    alert("Une erreur rÃ©seau est survenue.");
  }
}

// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Gérer immédiatement le retour de Stripe (Succès/Annulation)
    handleAllStripeReturns();
  // Débloquer l'audio dÃ¨s la premiÃ¨re interaction
  document.addEventListener("click", () => {
    const audio = document.getElementById("incomingCallSound");
    if (audio) { audio.muted = false; audio.play().catch(() => {}); }
  }, { once: true });

  // 🔴 récupérer user via service
  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/professeur/login.html"); // redirection si pas connectÃ©
    return;
  }

 AppState.setCurrentUser(userData);
AppState.token = localStorage.getItem("token"); // OK pour token (mais idéalement setter)
  AppState.setCallState(null);

  renderCurrentUserInfo(userData);

  // 🔴 si c'est un professeur, init Stripe onboarding
if (AppState.currentUser?.role === "prof" && !AppState.currentUser?.stripe_onboarding_complete) {
  const stripeBtn = document.getElementById("stripe-onboarding-btn");
  if (stripeBtn) {
    stripeBtn.style.display = "block";
    stripeBtn.addEventListener("click", initStripeOnboarding);
  }
}
  // 🔴 Connexion WebSocket
  const _wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const _wsToken = localStorage.getItem("token") ?? AppState.token ?? "";
  socketService.connect(`${_wsProtocol}//${window.location.host}?token=${_wsToken}`);
    

  bindUI();
  subscribeToDomains();

  // 🔵 Broadcast initial des profs connectés vers les élèves
  updateOnlineProfessors();
  });
// ======================================================
// DOMAIN SUBSCRIPTIONS _ UI écoute uniquement
// ======================================================

function subscribeToDomains() {
  // ================= SESSION =================
  AppState.on('session:start', (session) => onSessionStarted({ roomId: session?.roomId, type: 'startSession' }));
  
  // ================= CALL =================
  AppState.on('callState:change', (state) => {
    switch (state) {
      case 'calling':  updateCallStatus('Appel en cours...'); break;
      case 'ringing':
      case 'incoming': showIncomingCall(AppState.currentIncomingCallEleveId); break;
      case 'inCall':   hideIncomingAlert(); updateCallStatus('En communication'); setSessionActive(true); break;
      case null:
      default:         hideIncomingAlert(); cleanupSession('Session terminee'); break;
    }
  });
  AppState.on('video:localTrack',   (track)  => attachLocalVideo(track));
  AppState.on('video:remoteTracks', (tracks) => attachRemoteTracks(tracks));
  AppState.on('call:incoming',      (data)   => showIncomingCall(data));

  // ================= CHAT =================
  AppState.on('chat:new', (msg) => renderChat(msg));

  // ================= DOCUMENT =================
  // ✅ écouter AppState (source officielle)
  if (!window.__DOC_SUBSCRIBED__) {
  window.__DOC_SUBSCRIBED__ = true;

AppState.on("documents:new", (doc) => {
  console.log("📄 UI PROF reçoit doc:", doc);

  addDocument({
    id:       doc.id ?? doc.fileName,
    name:     doc.fileName ?? doc.name,
    fileData: doc.fileData,
    url:      doc.url ?? doc.fileUrl ?? null
  });
});
}
  // ================= WHITEBOARD =================
  WhiteboardService.onStroke((stroke) => drawStroke(stroke));
  WhiteboardService.onClear(() => clearCanvas());
  WhiteboardService.onSync((strokes) => {
  clearCanvas();
  for (const s of strokes) drawStroke(s);
  });
  // 👇 ICI EXACTEMENT (juste après les autres whiteboard handlers)
  AppState.on("whiteboard:clear", () => {
    WhiteboardService.applyRemoteClear(false);
  });
}
  

// ======================================================
// ONLINE PROFESSORS
// ======================================================

function updateOnlineProfessors() {
  // récupère la liste actuelle des profs connectés
  const profs = SessionService.getOnlineProfessors?.() || [];
}

// ======================================================
// BIND UI — boutons bindés une seule fois
// ======================================================

function bindUI() {

  // ================= BOUTON TERMINER =================
  // ================= BOUTON TERMINER =================
const endBtn = document.getElementById("end-session-btn");
endBtn?.addEventListener("click", () => {
  console.log("🖱️ Clic Terminer — roomId:", AppState.currentRoomId);
  SessionService.stopVideoCall(); // ← appelle déjà terminateCall en interne
});
  // ================= BOUTONS D'APPEL =================
  let acceptInProgress = false;
  const acceptBtn = document.getElementById("accept-call-btn");
  acceptBtn?.addEventListener("click", () => {
    if (acceptInProgress) return;
    const eleveId = AppState.currentIncomingCallEleveId;
    if (!eleveId) { console.warn("âš ï¸ Aucun appel Ã  accepter"); return; }
    acceptInProgress = true;
    socketService.send({ type: "acceptCall", eleveId });
    AppState.currentIncomingCallEleveId = null;
    hideIncomingAlert();
    setTimeout(() => { acceptInProgress = false; }, 5000);
  });

  const cancelBtn = document.getElementById("cancel-call-btn");
  cancelBtn?.addEventListener("click", () => {
    const eleveId = AppState.currentIncomingCallEleveId;
    if (!eleveId) return;
    socketService.send({ type: "rejectCall", eleveId });
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
  setSessionActive(true); // ✅ affiche le timer ET le bouton terminer

  WhiteboardService.initCanvas("whiteboard-canvas", event.roomId);

  const remoteInfo = document.getElementById("remote-eleve-info");
  if (remoteInfo) remoteInfo.style.display = "none";

  // ✅ NE PAS appeler SessionService.startTimer ici
  // Le timer est démarré dans joinedRoom du socket handler prof
  // SessionService.startTimer?.(updateTimerUI); ← SUPPRIMER cette ligne

  // ✅ Abonner updateTimerUI au tick du timer
  AppState.on("timer:update", (seconds) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    updateTimerUI(`${m}:${s}`);
  });
}
function setSessionActive(active) {
  const endBtn = document.getElementById("end-session-btn");
  const badge  = document.getElementById("session-badge");
  const timer  = document.getElementById("call-time");

  if (endBtn) endBtn.style.display = active ? "" : "none";
  if (badge)  badge.classList.toggle("active", active);
  if (timer)  timer.style.display = active ? "" : "none";
}

function cleanupSession(message) {
  if (cleanupSession._running) return; // ✅ guard anti-boucle
  cleanupSession._running = true;

  VideoService.disconnect();
  AppState.setCallState(null);
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
  if (remoteInfo) { remoteInfo.textContent = "En attente d'un Ã©lÃ¨veâ€¦"; remoteInfo.style.display = ""; }

  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";
  resetChat();
  clearCanvas();
  cleanupSession._running = false; // ✅ libère le guard
}

// ======================================================
// CALL UI
// ======================================================

function showIncomingCall({ eleveId, eleveName, eleveVille, elevePays }) {
  console.log("🔔 showIncomingCall appelée", { eleveId, eleveName });

  AppState.currentIncomingCallEleveId = eleveId ?? null;
  const audio = document.getElementById("incomingCallSound");
  audio?.play().catch(() => {});
  const box    = document.getElementById("incoming-call-box");
  const text   = document.getElementById("incoming-call-text");
  const noCall = document.getElementById("no-call");

 console.log("box avant:", box?.className, box?.style.cssText);

  if (box) {
    box.removeAttribute("style");   // supprime style="display:none;" du HTML
    box.classList.add("visible");   // le CSS affiche en flex via #incoming-call-box.visible
  }
  if (noCall) noCall.style.display = "none";
  if (text) {
    const location = eleveVille && elevePays ? ` â€” ${eleveVille}, ${elevePays}` : "";
    text.textContent = `${eleveName || "Ã‰lÃ¨ve"}${location}`;
  }

  console.log("box aprÃ¨s:", box?.className, getComputedStyle(box).display, box?.offsetHeight);
}

function hideIncomingAlert() {
  const box    = document.getElementById("incoming-call-box");
  const noCall = document.getElementById("no-call");
  if (box) {
    box.classList.remove("visible"); // retire .visible â†’ CSS repasse Ã  display: none
  }
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
  appendMessage(sender, text, false); // âœ…
}

// ======================================================
// DOCUMENT UI
// ======================================================

let isSendingDocument = false;

function sendDocument() {
  const input = document.getElementById("file-input");
  if (!input?.files?.[0]) return;

  if (isSendingDocument) return;
  isSendingDocument = true;

  SessionService.sendDocument(input.files[0]);
  input.value = "";

  setTimeout(() => isSendingDocument = false, 1000);
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

function renderCurrentUserInfo(user) {
  // 1. Récupération des données (on utilise 'user' passé en paramètre)
  const { prenom, nom, ville, pays, is_subscriber, role } = user || {};

  // 2. Mise à jour de l'en-tête (ton ancien code)
  const nameEl = document.getElementById("prof-name");
  const locEl  = document.getElementById("prof-location");
  if (nameEl) nameEl.textContent = `${prenom ?? ""} ${nom ?? ""}`.trim();
  if (locEl)  locEl.textContent  = ville && pays ? `${ville}, ${pays}` : "";

  // 3. Mise à jour du conteneur d'infos/Stripe (ton nouveau code)
  const infoContainer = document.getElementById("user-info"); 
  if (infoContainer) {
    infoContainer.innerHTML = `
        <div class="card">
            <h3>Mon compte</h3>
            <p>Utilisateur : ${prenom ?? ""} ${nom ?? ""}</p>
            <p>Statut : ${is_subscriber ? 'âœ… AbonnÃ©' : 'âŒ Non abonnÃ©'}</p>
            
            <button id="stripe-setup-btn" class="btn-primary">
                ${role === 'prof' ? 'âš™ï¸ Configurer mon compte Stripe' : 'ðŸ’³ Enregistrer ma carte bancaire'}
            </button>
            
            <div id="stripe-status" style="margin-top: 10px;"></div>
        </div>
    `;

    // 4. écouteur d' événement pour Stripe
    const stripeBtn = document.getElementById("stripe-setup-btn");
    if (stripeBtn) {
        stripeBtn.addEventListener("click", async (e) => {
            e.preventDefault();
            stripeBtn.disabled = true;
            const originalText = stripeBtn.textContent;
            stripeBtn.textContent = "â³ Chargement...";

            try {
                await openSetupSession(); // La fonction importÃ©e
            } catch (error) {
                console.error("Erreur Stripe:", error);
                alert("Impossible d'ouvrir la session Stripe.");
                stripeBtn.disabled = false;
                stripeBtn.textContent = originalText;
            }
        });
    }
  }
}

