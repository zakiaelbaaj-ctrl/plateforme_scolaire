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
import { getUserProfile } from "../../services/user.service.js"; // service fictif qui récupère le user connecté
import { handleAllStripeReturns, openSetupSession } from '/js/services/stripe.service.js';
import { ScreenShareService } from "/js/domains/call/screen.share.service.js";
import { ScreenShareOverlay }  from "/js/ui/components/screen.share.overlay.js";
let whiteboardWrapper = null;
let videoMiniature = null;
const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:4000" 
  : "https://plateforme-scolaire-1.onrender.com";

const API_BASE = `${API_URL}/api/v1`;
// ================= STRIPE ONBOARDING =================
async function initStripeOnboarding() {
  try {
    // On utilise API_BASE qui est définie en haut du fichier
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
      // Ajout d'une alerte si le lien est absent (très utile pour le débug)
      alert("Erreur : " + (data.message || "Impossible de générer le lien Stripe."));
    }
  } catch (err) {
    console.error("Erreur Stripe onboarding:", err);
    alert("Une erreur réseau est survenue.");
  }
}

// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Gérer immédiatement le retour de Stripe (Succès/Annulation)
    handleAllStripeReturns();
  // Débloquer l'audio dès la première interaction
  document.addEventListener("click", () => {
    const audio = document.getElementById("incomingCallSound");
    if (audio) { audio.muted = false; audio.play().catch(() => {}); }
  }, { once: true });

  // 👇 ICI EXACTEMENT (juste après les autres whiteboard handlers)
  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/professeur/login.html"); // redirection si pas connecté
    return;
  }

 AppState.setCurrentUser(userData);
AppState.token = localStorage.getItem("token"); // OK pour token (mais idéalement setter)
  AppState.setCallState(null);

  renderCurrentUserInfo(userData);

  // // 🔴 Si c'est un professeur, init Stripe onboarding
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
  // Cacher le partage d'écran si non supporté (tablette/mobile)
const screenShareBtn = document.getElementById("screen-share-btn");
if (screenShareBtn && !navigator.mediaDevices?.getDisplayMedia) {
  screenShareBtn.style.display = "none";
}

  // 🔴 Broadcast initial des profs connectés vers les élèves
  updateOnlineProfessors();
  });
// ======================================================
// DOMAIN SUBSCRIPTIONS _ UI écoute uniquement
// ======================================================

function subscribeToDomains() {
  // ================= INDICATEUR CONNEXION =================
  AppState.on("ws:status", (data) => {
    updateWsStatus(data?.status, data?.attempt);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const wrapper = document.getElementById("whiteboard-wrapper");
      if (wrapper?.classList.contains("whiteboard-fullscreen")) {
        toggleWhiteboardFullscreen();
      }
    }
  });

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
  AppState.on("timer:update", (seconds) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    updateTimerUI(`${m}:${s}`);
  });
  AppState.on('video:remoteTracks', (tracks) => attachRemoteTracks(tracks));
  AppState.on('call:incoming',      (data)   => showIncomingCall(data));

  // ================= CHAT =================
  AppState.on('chat:new', (msg) => renderChat(msg));

  
  // ================= WHITEBOARD =================
  WhiteboardService.onToolChange?.((remoteTool) => {
  WhiteboardService.setTool(remoteTool);
});
// ================= DOCUMENT =================
AppState.on("documents:new", (doc) => {
  console.log("✅ UI PROF reçoit doc:", doc);
  addDocument({
    id:       doc.id ?? doc.fileName,
    name:     doc.fileName ?? doc.name,
    fileData: doc.fileData,
    url:      doc.url ?? doc.fileUrl ?? null
  });
});
// ================= PARTAGE D'ÉCRAN =================
ScreenShareService.onStart((track) => {
  // Affiche l'overlay pour celui qui partage aussi (optionnel)
});

ScreenShareService.onStop(() => {
  ScreenShareOverlay.hide();
  const btn = document.getElementById("screen-share-btn");
  if (btn) { btn.textContent = "🖥️"; btn.title = "Partager l'écran"; }
});
  // ================= NOTIFICATION PAIEMENT =================
  AppState.on("ui:notification", (notif) => {
    const toast = document.createElement("div");
    toast.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 9999;
      background: #4CAF50; color: white; padding: 16px;
      border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: system-ui, sans-serif; min-width: 280px;
    `;
    toast.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 6px;">
        ✅ ${notif.title || "Paiement reçu"}
      </div>
      <div style="font-size: 14px;">${notif.message || ""}</div>
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(() => toast.remove(), 300);
    }, 8000);
  });

  // ================= WALLET UPDATE =================
  AppState.on("wallet:update", (montant) => {
    const walletEl = document.getElementById("wallet-balance");
    if (walletEl) {
      walletEl.textContent = `+${montant}€`;
    }
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
// // BIND UI — Boutons bindés une seule fois
// ======================================================

function bindUI() {

  // ================= BOUTON TERMINER =================
const endBtn = document.getElementById("end-session-btn");
endBtn?.addEventListener("click", () => {
  console.log("✅ Clic Terminer â roomId:", AppState.currentRoomId);
 SessionService.stopVideoCall(); // ⬅️ appelle déjà terminateCall en interne
});
  // ================= BOUTONS D'APPEL =================
  let acceptInProgress = false;
  const acceptBtn = document.getElementById("accept-call-btn");
  acceptBtn?.addEventListener("click", () => {
    if (acceptInProgress) return;
    const eleveId = AppState.currentIncomingCallEleveId;
    if (!eleveId) { console.warn("⚠️ Aucun appel à accepter"); return; }
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
  
// ================= WHITEBOARD =================

// Boutons outils
document.getElementById("undoWhiteboardBtn")?.addEventListener("click", () => WhiteboardService.undo());
document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => {
  WhiteboardService.clearCanvas(); // emit=true par défaut → broadcast tableauClear à toute la room
});
document.getElementById("downloadWhiteboardBtn")?.addEventListener("click", () => WhiteboardService.download?.());

document.getElementById("penToolBtn")?.addEventListener("click",    () => setWbTool("penToolBtn",    () => WhiteboardService.setTool("pen")));
document.getElementById("eraserToolBtn")?.addEventListener("click", () => setWbTool("eraserToolBtn", () => WhiteboardService.setTool("eraser")));
document.getElementById("pointToolBtn")?.addEventListener("click",  () => setWbTool("pointToolBtn",  () => WhiteboardService.setTool("point")));
document.getElementById("lineToolBtn")?.addEventListener("click",   () => setWbTool("lineToolBtn",   () => WhiteboardService.setTool("line")));
document.getElementById("rectToolBtn")?.addEventListener("click",   () => setWbTool("rectToolBtn",   () => WhiteboardService.setTool("rect")));
document.getElementById("circleToolBtn")?.addEventListener("click", () => setWbTool("circleToolBtn", () => WhiteboardService.setTool("circle")));
document.getElementById("textToolBtn")?.addEventListener("click",   () => setWbTool("textToolBtn",   () => WhiteboardService.setTool("text")));
document.getElementById("eraser-btn")?.addEventListener("click",    () => WhiteboardService.setTool("eraser"));

// === Toggle plein écran ===
const fullscreenBtn   = document.getElementById('wb-fullscreen-btn');
whiteboardWrapper = document.getElementById('whiteboard-wrapper'); 
videoMiniature = document.querySelector('.video-miniature');
const videoMini       = document.getElementById('remote-video-mini');

// Toggle plein écran
fullscreenBtn?.addEventListener('click', () => {
  const isMobile = !document.fullscreenEnabled;

  if (isMobile) {
    // Fallback CSS pour tablette/iOS
    toggleWhiteboardFullscreen();
  } else {
    if (!document.fullscreenElement) {
      whiteboardWrapper.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }
});

// Synchroniser si l’utilisateur entre/sort du fullscreen
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement === whiteboardWrapper) {
    videoMiniature.style.display = "block";
    syncMiniatureStream(); // ✅ attache le track sur la miniature visible
    fullscreenBtn.textContent = "❌ Quitter";
    fullscreenBtn.title = "Quitter le plein écran";
  } else {
    videoMiniature.style.display = "none";
    // Détacher proprement en sortant du plein écran
    if (remoteVideoTrack) remoteVideoTrack.detach(videoMini);
    fullscreenBtn.textContent = "⛶";
    fullscreenBtn.title = "Plein écran";
  }
});
  // ================= CHAT =================
  document.getElementById("send-msg")?.addEventListener("click", sendChat);
  document.getElementById("chat-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); sendChat(); }
  });
// ================= PARTAGE D'ÉCRAN =================
document.getElementById("screen-share-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("screen-share-btn");

  if (ScreenShareService.isSharing()) {
    await ScreenShareService.stop(VideoService.room);
    btn.textContent = "🖥️";
    btn.title = "Partager l'écran";
  } else {
    await ScreenShareService.start(VideoService.room);
    if (ScreenShareService.isSharing()) {
      btn.textContent = "⏹️";
      btn.title = "Arrêter le partage";
    }
  }
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
function updateWsStatus(status, attempt = 0) {
  const badge = document.getElementById("ws-status-badge");
  if (!badge) return;

  switch (status) {
    case "connected":
      badge.textContent = "🟢 Connecté";
      badge.style.color = "#4CAF50";
      badge.title = "";
      break;

    case "reconnecting":
      badge.textContent = `🟡 Reconnexion... (${attempt})`;
      badge.style.color = "#FF9800";
      badge.title = `Tentative ${attempt}`;
      break;

    case "disconnected":
      badge.textContent = "🔴 Hors ligne";
      badge.style.color = "#f44336";
      badge.title = "Connexion perdue";
      break;
  }
}
// ======================================================
// SESSION UI
// ======================================================

function onSessionStarted(event) {
  AppState.sessionInProgress = true;
  AppState.currentRoomId     = event.roomId;

  updateCallStatus("En communication");
  setSessionActive(true); //✅ affiche le timer ET le bouton terminer

  WhiteboardService.initCanvas("whiteboard-canvas", {
  colorPicker: document.getElementById("whiteboardColor"),
  sizeSlider:  document.getElementById("whiteboardSize")
  });
  const remoteInfo = document.getElementById("remote-eleve-info");
  if (remoteInfo) remoteInfo.style.display = "none";
}
  // ✅ NE PAS appeler SessionService.startTimer ici
  // Le timer est démarré dans joinedRoom du socket handler prof
  // SessionService.startTimer?.(updateTimerUI); ➡️ SUPPRIMER cette ligne

  
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
  // ✅ AJOUTER ICI — Arrêter le partage d'écran si actif
  ScreenShareService.stop(VideoService.room).catch(() => {});
  ScreenShareOverlay.hide();
  const ssBtn = document.getElementById("screen-share-btn");
  if (ssBtn) { ssBtn.textContent = "🖥️"; }
 VideoService.disconnect();
  AppState.setCallState(null);
  AppState.sessionInProgress = false;
  SessionService.stopTimer?.();
  setSessionActive(false);
  updateCallStatus(message);
  WhiteboardService.reset?.();

  ["remote-video", "local-video"].forEach(id => { // ✅
  const el = document.getElementById(id);
  if (el) el.srcObject = null;
});

  const remoteInfo = document.getElementById("remote-eleve-info");
  if (remoteInfo) { remoteInfo.textContent = "En attente d'un élève…"; remoteInfo.style.display = ""; }
  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";
  resetChat();
  clearCanvas();
  cleanupSession._running = false; // ✅ Libère le guard
}

// ======================================================
// CALL UI
// ======================================================

function showIncomingCall({ eleveId, eleveName, eleveVille, elevePays }) {
  console.log("⚠️ showIncomingCall appelée", { eleveId, eleveName });

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
    const location = eleveVille && elevePays ? ` — ${eleveVille}, ${elevePays}` : "";
text.textContent = `${eleveName || "Élève"}${location}`;
}
 console.log("box après:", box?.className, getComputedStyle(box).display, box?.offsetHeight);
}

function hideIncomingAlert() {
  const box    = document.getElementById("incoming-call-box");
  const noCall = document.getElementById("no-call");
  if (box) {
    box.classList.remove("visible"); // Retire .visible ➔ CSS repasse à display: none
  }
  if (noCall) noCall.style.display = "flex";
}
// ======================================================
// VIDEO TRACKS
// ======================================================
function attachLocalVideo(track) {
  const container = document.getElementById("localVideoContainer"); // ✅ cible le wrapper
  if (!container || track.kind !== "video") return;
  const el = track.attach();
  el.id = "local-video";
  el.autoplay = true;
  el.playsInline = true;
  el.muted = true;
  el.style.cssText = "width:100%; height:100%; object-fit:cover;";
  const old = container.querySelector("video#local-video");
  if (old) old.replaceWith(el);
  else container.prepend(el);
}
// Stocker le track distant globalement
let remoteVideoTrack = null; // ← déclaré en haut du fichier (scope module)

function attachRemoteTracks(tracks) {
  tracks?.forEach(track => {
    if (track.kind === "video") {
      remoteVideoTrack = track; // ✅ stocké pour syncMiniatureStream

      const container = document.getElementById("remoteVideoContainer");
      if (!container) return;

      const el = track.attach();
      el.id = "remote-video";
      el.autoplay = true;
      el.playsInline = true;
      el.style.cssText = "width:100%; height:100%; object-fit:cover;";

      const old = container.querySelector("video#remote-video");
      if (old) old.replaceWith(el);
      else container.prepend(el);

      // ✅ Si on est déjà en fullscreen quand le track arrive, attacher direct
      if (document.fullscreenElement === whiteboardWrapper) {
        console.log("🎯 track arrivé pendant fullscreen, attach miniature");
        const videoMini = document.getElementById("remote-video-mini");
        if (videoMini) _doAttachMiniature(videoMini);
      }
    }

    if (track.kind === "audio") {
      const audio = track.attach();
      audio.autoplay = true;
      audio.muted = false;
      document.body.appendChild(audio);
    }
  });
}

function _doAttachMiniature(videoMini) {
  if (!remoteVideoTrack || !videoMini) return;
  remoteVideoTrack.detach(videoMini);
  remoteVideoTrack.attach(videoMini);
  videoMini.autoplay = true;
  videoMini.playsInline = true;
  videoMini.muted = true;
  videoMini.play().catch(e => console.error("❌ miniature play() failed:", e));
}

function syncMiniatureStream() {
  const videoMini = document.getElementById("remote-video-mini");
  if (!videoMini) return;

  if (!remoteVideoTrack) {
    // Track pas encore là → retry toutes les 500ms, max 10s
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (remoteVideoTrack) {
        clearInterval(interval);
        _doAttachMiniature(videoMini);
      } else if (attempts >= 20) {
        clearInterval(interval);
        console.warn("❌ track jamais arrivé après 10s");
      }
    }, 500);
    return;
  }

  _doAttachMiniature(videoMini);
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
  appendMessage(sender, text, false); // élève/écran…
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
  const btn     = document.getElementById("wb-fullscreen-btn");
  if (!wrapper) return;

  const isFullscreen = wrapper.classList.toggle("whiteboard-fullscreen");

  if (isFullscreen) {
    if (btn) { btn.textContent = "⊡"; btn.title = "Quitter le plein écran"; }
  } else {
    if (btn) { btn.textContent = "⛶"; btn.title = "Plein écran"; }
  }

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
            <p>Statut : ${is_subscriber ? '✅ Abonné' : '❌ Non abonné'}</p>
            <button id="stripe-setup-btn" class="btn-primary">
                ${role === 'prof' ? '⚙️ Configurer mon compte Stripe' : '💳 Enregistrer ma carte bancaire'}
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
             stripeBtn.textContent = "🔄 Chargement...";
            try {
                await openSetupSession(); // La fonction importée
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

// ================= ALTERNANCE DES VIDÉOS =================
const localBlock = document.getElementById("localBlock");
const remoteBlock = document.getElementById("remoteBlock");

function toggleVideoFocus(clickedBlock, otherBlock) {
  // On n'agit que si le bloc cliqué est actuellement la petite miniature
  if (clickedBlock.classList.contains("video-floating")) {
    
    // Le bloc cliqué devient grand
    clickedBlock.classList.remove("video-floating");
    clickedBlock.classList.add("video-main");

    // L'autre bloc devient la miniature flottante
    otherBlock.classList.remove("video-main");
    otherBlock.classList.add("video-floating");
  }
}

// Écouteur sur ton bloc (Caméra Prof)
localBlock.addEventListener("click", (e) => {
  // Sécurité : si on clique sur un bouton ou un overlay textuel, on ne switch pas
  if (e.target.closest("button") || e.target.closest(".video-overlay")) return;
  toggleVideoFocus(localBlock, remoteBlock);
});

// Écouteur sur le bloc de l'étudiant
remoteBlock.addEventListener("click", (e) => {
  if (e.target.closest("button") || e.target.closest(".video-overlay")) return;
  toggleVideoFocus(remoteBlock, localBlock);
});