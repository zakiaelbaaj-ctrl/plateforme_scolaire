// ======================================================
// DASHBOARD ELEVE _ UI PURE
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
import { handleAllStripeReturns, openSetupSession, initStripeOnboarding } from '/js/services/stripe.service.js';

/// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("🚀 Initialisation du Dashboard...");

  // Lire AVANT nettoyage
  const urlParams = new URLSearchParams(window.location.search);
  const stripeStatus = urlParams.get("stripe");

  // Puis traiter Stripe UNE seule fois
  handleAllStripeReturns();

  // Si succÃƒÂ¨s Ã¢â€ â€™ refresh après webhook
  if (stripeStatus === "success") {
    setTimeout(refreshUI, 2500);
  }

  // Débloquer audio
  document.addEventListener("click", () => {
    const audio = document.getElementById("incomingCallSound");
    if (audio) { 
      audio.muted = false; 
      audio.play().catch(() => {}); 
    }
  }, { once: true });

  // User
  const userData = await getUserProfile();
  
  if (!userData) {
    window.location.replace("/pages/eleve/login.html");
    return;
  }

  AppState.setCurrentUser(userData);
  localStorage.setItem("currentUser", JSON.stringify(userData));
  AppState.token = localStorage.getItem("token");
  AppState.setCallState(null);

  // Initialisation de l'UI
  renderCurrentUserInfo(userData);

  // WebSocket
  const _wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const _wsToken = localStorage.getItem("token") ?? AppState.token ?? "";
  if (!_wsToken) {
  console.warn("⚠️ Aucun token WebSocket");
}
  socketHandlerEleve.init();
  socketService.connect(`${_wsProtocol}//${window.location.host}?token=${_wsToken}`);
  
  // Bind
  bindUI();
   initUIRenderers();
  subscribeToDomains();


  console.log("🚀 Dashboard initialisé pour:", userData.prenom || userData.username || "Utilisateur");
});

// ======================================================
// DOMAIN SUBSCRIPTIONS
// ======================================================

    function subscribeToDomains() {

  // ================= SESSION =================
  AppState.on('session:start', (session) => {
    WhiteboardService.initCanvas('whiteboard-canvas', session?.roomId);
});

  // ================= CHAT =================
  // Un seul abonnement, ici, avec appendMessage
  ChatService.onMessage((msg) => {
    if (!msg?.text) return;
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
  AppState.on('ui:updateTools', (canUse) => { 
  AppState.canUseTools = canUse;
  updateToolButtons();
});
  AppState.on('callState:change', (state) => {
  switch (state) {
    case 'calling':  updateCallStatus('Appel en cours...'); break;
    case 'ringing':  updateCallStatus('Appel entrant...'); break;
    case 'inCall':   updateCallStatus('En communication'); break;
    case 'ended':    cleanupSession('Session terminée'); break; // ✅ explicite
    case null:       cleanupSession('Session terminée'); break; // ✅ explicite
    // default vide — ignore les états inconnus
  }
});
   AppState.on("timer:update", (seconds) => {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  updateTimerUI(`${m}:${s}`);
  });
  AppState.on('video:remoteTracks', (tracks) => attachRemoteTracks(tracks));
  AppState.on('video:connected',    ()       => updateCallStatus('En communication'));
  AppState.on("documents:new", (doc) => {
  console.log("🔥 EVENT documents:new déclenché", doc);

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
    if (e.key === "Enter" && e.target.value.trim()) sendChat();
  });

  document.getElementById("send-file")?.addEventListener("click", sendDocument);

  document.getElementById("logout-btn")?.addEventListener("click", () => {
    VideoService.disconnect();
    localStorage.clear();
    window.location.href = "/pages/eleve/login.html";
  });

  document.getElementById("end-session-btn")?.addEventListener("click", () => {
  console.log("🖱️ Clic Terminer élève — roomId:", AppState.currentRoomId);
  SessionService.stopVideoCall();
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

// ================= STRIPE =================
document.getElementById("stripe-setup-btn")?.addEventListener("click", async () => {
  console.log("🖱️ Clic carte bancaire");
  const btn = document.getElementById("stripe-setup-btn");
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = "⏳ Connexion sécurisée...";
  try {
    await openSetupSession();
  } catch (err) {
    console.error("Erreur Stripe:", err);
    btn.innerHTML = "❌ Erreur, réessayer";
    setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
  }
});

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

    // Ã¢Å“â€¦ textContent Ã¢â‚¬â€ plus de XSS
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
  if (!ctx) return;
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
  if (!ctx) return;

  if (!textStroke?.text) return;

  ctx.fillStyle = textStroke.color;
  ctx.font = `${textStroke.size * 5}px sans-serif`;
  ctx.fillText(textStroke.text, textStroke.x, textStroke.y);
}


function clearCanvas() {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
if (!ctx) return;
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
      audio.onended = () => audio.remove();
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
  if (cleanupSession._running) return; // ✅ guard anti-boucle
  cleanupSession._running = true;

  VideoService.disconnect();
  AppState.setCallState(null);
  AppState.sessionInProgress = false;
  SessionService.stopTimer?.();
  updateCallStatus(message);

  const remote = document.getElementById("remoteVideoContainer");
  const local  = document.getElementById("localVideoContainer");
  if (remote) remote.innerHTML = "En attente du professeur...";
  if (local)  local.innerHTML  = "";

  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";

  WhiteboardService.reset?.();
  resetChat();

  cleanupSession._running = false; // ✅ libère le guard
}
// ✔ Ajouter avant la derniÃƒÂ¨re fonction renderCurrentUserInfo
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

// ======================================================
// 1. GESTION DE L'INTERFACE UTILISATEUR (UI)
// ======================================================

/**
 * Rafraichit les données utilisateur depuis le serveur et met ÃƒÂ  jour l'UI
 */
async function refreshUI() {
  console.log("🔄 Actualisation des données utilisateur...");

  const userData = await getUserProfile();

  if (userData) {
    AppState.setCurrentUser(userData);
    renderCurrentUserInfo(userData);
  }
}

/**
 * Affiche les informations de profil et l'état des paiements Stripe
 */
function renderCurrentUserInfo(user) {
  if (!user) return;
  const { prenom, nom, ville, pays, role, has_payment_method, stripe_onboarding_complete } = user;

 // --- MISE À JOUR DES ÉLÉMENTS FIXES (TEXTE) ---
const nameEl = document.getElementById("eleve-name") || document.getElementById("user-full-name");
const cityEl = document.getElementById("eleve-location") || document.getElementById("user-city");

if (nameEl) nameEl.textContent = `${prenom || ""} ${nom || ""}`.trim();
if (cityEl) cityEl.textContent = (ville && pays) ? `${ville}, ${pays}` : (ville || pays || "Lieu non précisé");

// --- GESTION DU CONTENEUR STRIPE ---
  const infoContainer = document.getElementById("user-info");
  if (!infoContainer) return;

  let stripeHTML = "";

  // Cas ÉLÈVE : Inscription d'une carte bancaire
if (role === "eleve") {
  if (has_payment_method) {
    stripeHTML = `
      <div class="stripe-box success">
        <p>✅ <strong>Carte bancaire enregistrée</strong></p>
        <p class="small">Votre moyen de paiement est prêt pour vos prochains cours.</p>
        <button id="stripe-setup-btn" class="btn-link">Mettre à jour ma carte</button>
      </div>`;
  } else {
    stripeHTML = `
      <div class="stripe-box warning">
        <p>⚠️ <strong>Paiement requis</strong></p>
        <p class="small">Veuillez enregistrer une carte pour pouvoir appeler un professeur.</p>
        <button id="stripe-setup-btn" class="btn-primary">💳 Ajouter une carte bancaire</button>
      </div>`;
  }
}
  // Cas PROFESSEUR : Onboarding Stripe Connect
else if (role === "prof") {
  if (stripe_onboarding_complete) {
    stripeHTML = `
      <div class="stripe-box success">
        <p>✅ <strong>Compte Stripe configuré</strong></p>
        <p class="small">Vous pouvez recevoir des paiements de vos élèves.</p>
      </div>`;
  } else {
    stripeHTML = `
      <div class="stripe-box warning">
        <p>💰 <strong>Revenus en attente</strong></p>
        <p class="small">Configurez votre compte pour recevoir vos virements.</p>
        <button id="stripe-onboarding-btn" class="btn-primary">⚡ Activer Stripe Connect</button>
      </div>`;
  }
}

  // Injection du HTML dans la carte dédiée
  infoContainer.innerHTML = `
    <div class="user-card">
      <div class="user-card__header">
        <h3 class="card-title">💳 Paramètres de paiement</h3>
        </div>
      <div class="user-card__body">
        <div class="user-card__stripe-content">
          ${stripeHTML}
        </div>
        <div id="stripe-status-message"></div>
      </div>
    </div>
  `;
// --- ATTACHEMENT SÉCURISÉ DES ÉVÉNEMENTS ---
  const setupBtn = document.getElementById("stripe-setup-btn");
console.log("🔍 setupBtn =", setupBtn);

if (setupBtn) {
  setupBtn.replaceWith(setupBtn.cloneNode(true));
  const cleanBtn = document.getElementById("stripe-setup-btn");

  cleanBtn.addEventListener("click", async (e) => {
    const btn = e.currentTarget;

    const originalText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = "⏳ Connexion sécurisée...";

    try {
      await openSetupSession();
    } catch (err) {
      console.error("Erreur Stripe:", err);
      btn.innerHTML = "❌ Erreur, réessayer";
    } finally {
      btn.disabled = false;

      // optionnel : restaurer le texte si erreur
      if (btn.innerHTML.includes("Erreur")) {
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      }
    }
  });
}

  const onboardingBtn = document.getElementById("stripe-onboarding-btn");
  if (onboardingBtn) {
    onboardingBtn.addEventListener("click", initStripeOnboarding);
  }
}


window.renderProfList = renderProfList;
