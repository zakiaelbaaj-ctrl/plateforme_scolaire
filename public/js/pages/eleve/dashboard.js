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
import { ScreenShareService } from "/js/domains/call/screen.share.service.js";
import { ScreenShareOverlay }  from "/js/ui/components/screen.share.overlay.js";
import { initUIRenderers } from "/js/modules/ui/uiRenderers.js";
import { socketHandlerEleve } from "/js/core/socket.handler.eleve.js";
import { getUserProfile } from "../../services/user.service.js";
import { handleAllStripeReturns, holdFundsForSession } 
from "/js/services/stripe.service.js";
import { initStripeOnboarding } from "/js/services/stripe.service.js";
import { openSetupSession } from "/js/services/stripe.service.js";
// ✅ Variables module pour la miniature
let remoteVideoTrack = null;
let whiteboardWrapper = null;
let videoMiniature = null;
// ======================================================
// INIT
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {
  console.log("⚠️🤖 Initialisation du Dashboard...");

  // 1. Gérer les messages de retour Stripe (Succés/Annul)
  handleAllStripeReturns();

  // 2. Débloquer l'audio au premier clic
  const unlockAudio = () => {
    const audio = document.getElementById("incomingCallSound");
    if (audio) {
      audio.muted = false;
      audio.play().catch(() => {});
      console.log("⚠️🤖 Audio débloqué");
    }
    document.removeEventListener("click", unlockAudio);
  };
  document.addEventListener("click", unlockAudio);

  // 3. Récupération unique du profil utilisateur
  let userData = await getUserProfile();
  
  if (!userData) {
    console.warn("⚠️🤖 Session expirée, redirection...");
    window.location.replace("/pages/eleve/login.html");
    return;
  }

  // Initialisation de l'état global et de l'UI
  saveAndRenderUser(userData);
  AppState.token = localStorage.getItem("token");
  AppState.setCallState(null);

  // 4. LOGIQUE DE SYNCHRONISATION (Polling) : Si retour Stripe mais carte encore 'false'
  const urlParams = new URLSearchParams(window.location.search);
  const stripeStatus = urlParams.get("stripe");

  if (stripeStatus === "success" && !userData.has_payment_method) {
    console.log("⚠️🤖 Carte en cours de validation par Stripe, polling lancé...");
    
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      console.log(`⚠️🤖 Vérification Webhook (tentative ${attempts}/5)...`);
      
      const freshData = await getUserProfile();
      if (freshData.has_payment_method || attempts >= 5) {
        console.log("⚠️🤖 Statut mis à jour ou limite atteinte");
        saveAndRenderUser(freshData);
        clearInterval(interval);
      }
    }, 2500); // 2.5 secondes entre chaque vérification
  }
  // Lancer les WebSockets
  socketHandlerEleve.init();
  const _wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  socketService.connect(`${_wsProtocol}//${window.location.host}?token=${AppState.token}`);

  // Activer les clics et les abonnements
  bindUI();
  initUIRenderers();
  subscribeToDomains();
  console.log("⚠️🤖 Dashboard prêt");
});

/**
 * Fonction utilitaire pour synchroniser LocalStorage, AppState et UI
 */
function saveAndRenderUser(user) {
  if (!user) return;
  localStorage.setItem("currentUser", JSON.stringify(user));
  if (typeof AppState !== 'undefined' && AppState.setCurrentUser) {
    AppState.setCurrentUser(user);
  }
  renderCurrentUserInfo(user);
// Optionnel : met à jour le bouton Rejoindre si présent
  if (typeof updateJoinButton === 'function') updateJoinButton(user);
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
    console.warn("❌ remoteVideoTrack est null");
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
// ======================================================
// DOMAIN SUBSCRIPTIONS
// ======================================================

    function subscribeToDomains() {
      // ================= INDICATEUR CONNEXION =================
AppState.on("ws:status", (data) => {
  console.log("WS STATUS", data);
  console.log("CURRENT USER", AppState.currentUser);

  updateWsStatus(data?.status, data?.attempt);
  if (data?.status === "connected" && AppState.currentUser?.id) {
    console.log("🚀 ENVOI IDENTIFY", AppState.currentUser);

    socketService.send({ type: "identify", ...AppState.currentUser });
  }
});

  // ================= SESSION =================
    AppState.on('session:start', (session) => {
      AppState.canUseTools = true;
      updateToolButtons(); 
      WhiteboardService.initSession();
      WhiteboardService.initCanvas('whiteboard-canvas', {
       colorPicker: document.getElementById("whiteboardColor"),
       sizeSlider:  document.getElementById("whiteboardSize")
      });
     });
// ================= PROFESSEURS EN LIGNE =================  ← AJOUTER ICI
  AppState.on("professors:update", (profs) => {
    renderProfList(profs);
  });

  // ================= CHAT =================
  // Un seul abonnement, ici, avec appendMessage
  ChatService.onMessage((msg) => {
    if (!msg?.text) return;
   appendMessage(msg.sender, msg.text);
  });
  
  // ================= WHITEBOARD =================
  WhiteboardService.onToolChange?.((remoteTool) => {
  // Met à jour l'outil ET l'état visuel du bouton chez l'élève
  setWbTool(`${remoteTool}ToolBtn`, () => WhiteboardService.setTool(remoteTool));
});
  AppState.on("whiteboard:clear", () => {WhiteboardService.applyRemoteClear(false);});
  // ================= PARTAGE D'ÉCRAN =================
ScreenShareService.onStart((track) => {
  // Affiche l'overlay pour celui qui partage aussi (optionnel)
});

ScreenShareService.onStop(() => {
  ScreenShareOverlay.hide();
  const btn = document.getElementById("screen-share-btn");
  if (btn) { btn.textContent = "🖥️"; btn.title = "Partager l'écran"; }
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
    case 'ended':    cleanupSession('Session terminée'); break; // ⚠️ explicite
    case null:       cleanupSession('Session terminée'); break; // ⚠️ explicite
    // default vide  ignore les états inconnus
  }
});
   AppState.on("timer:update", (seconds) => {
  const m = String(Math.floor(seconds / 60)).padStart(2, "0");
  const s = String(seconds % 60).padStart(2, "0");
  updateTimerUI(`${m}:${s}`);
  });
  AppState.on('video:remoteTracks', (tracks) => attachRemoteTracks(tracks));
  // ✅ Stocker le track pour la miniature
window.addEventListener("remoteVideoTrackReady", (e) => {
  remoteVideoTrack = e.detail;
  if (document.fullscreenElement === whiteboardWrapper) {
    const videoMini = document.getElementById("remote-video-mini");
    if (videoMini) _doAttachMiniature(videoMini);
  }
});
  AppState.on('video:connected',    ()       => updateCallStatus('En communication'));
  AppState.on("documents:new", (doc) => {
  console.log("⚠️🤖 EVENT documents:new déclenché", doc);

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
// ================= VIDEO MAGNETIQUE STYLE WHATSAPP =================
whiteboardWrapper = document.getElementById("whiteboard-wrapper");
videoMiniature    = document.querySelector("#whiteboard-wrapper .video-miniature"); 
const elVideo = document.querySelector('.card--video');
  const videoHeader = elVideo?.querySelector('.card__header');

  if (videoHeader && elVideo) {
    // On ajoute une transition CSS pour un effet d'aimant fluide lors du relâchement
    elVideo.style.transition = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s";

    videoHeader.onmousedown = function(e) {
      // On coupe la transition pendant qu'on glisse pour éviter les saccades
      elVideo.style.transition = "none";

      let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      document.onmouseup = () => { 
        document.onmouseup = null; 
        document.onmousemove = null; 

        // --- LOGIQUE D'AIMANTATION (SNAP TO CORNERS) ---
        elVideo.style.transition = "all 0.3s cubic-bezier(0.25, 1, 0.5, 1)"; // On remet l'effet fluide
        
        const rect = elVideo.getBoundingClientRect();
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        const margin = 24; // L'espace (var(--space-lg)) entre la fenêtre et le bord de l'écran

        // Calculer si on est plus proche de la gauche ou de la droite
        if (rect.left + rect.width / 2 < windowWidth / 2) {
          elVideo.style.left = `${margin}px`;
          elVideo.style.right = "auto";
        } else {
          elVideo.style.left = "auto";
          elVideo.style.right = `${margin}px`;
        }

        // Calculer si on est plus proche du haut ou du bas
        if (rect.top + rect.height / 2 < windowHeight / 2) {
          elVideo.style.top = `${margin}px`;
          elVideo.style.bottom = "auto";
        } else {
          elVideo.style.top = "auto";
          elVideo.style.bottom = `${margin}px`;
        }
      };
      
      document.onmousemove = (e) => {
        pos1 = pos3 - e.clientX; 
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX; 
        pos4 = e.clientY;
        
        elVideo.style.top = (elVideo.offsetTop - pos2) + "px";
        elVideo.style.left = (elVideo.offsetLeft - pos1) + "px";
        elVideo.style.bottom = "auto"; 
        elVideo.style.right = "auto";
      };
    };
  }

  // ================= ALTERNANCE DES VIDÉOS AU CLIC =================
  const videosContainer = document.querySelector('.videos');

  if (videosContainer) {
    videosContainer.addEventListener('click', (e) => {
      const clickedBlock = e.target.closest('.video-block');
      if (clickedBlock) {
        const isCurrentlyLocalSmall = !videosContainer.classList.contains('is-swapped') && clickedBlock.classList.contains('video-block--local');
        const isCurrentlyRemoteSmall = videosContainer.classList.contains('is-swapped') && clickedBlock.classList.contains('video-block--remote');
        
        if (isCurrentlyLocalSmall || isCurrentlyRemoteSmall) {
          videosContainer.classList.toggle('is-swapped');
          console.log("⚠️🤖 Alternance des flux vidéo appliquée");
        }
      }
    });
  }
  // ================= RÉDUIRE / AGRANDIR LA FENÊTRE VIDÉO =================
  const collapseBtn = document.getElementById('toggle-collapse-btn');
  
  if (collapseBtn && elVideo) {
    collapseBtn.addEventListener('click', (e) => {
      // TRÈS IMPORTANT : Empêche le drag-and-drop de s'activer quand on clique sur le bouton
      e.stopPropagation(); 
      
      // Alterne la classe CSS de réduction
      elVideo.classList.toggle('is-collapsed');
      
      // Met à jour l'icône du bouton dynamiquement
      if (elVideo.classList.contains('is-collapsed')) {
        collapseBtn.textContent = "🔲"; // Icône "Agrandir"
        collapseBtn.title = "Agrandir la vidéo";
      } else {
        collapseBtn.textContent = "➖"; // Icône "Réduire"
        collapseBtn.title = "Réduire la vidéo";
      }
      
      console.log("⚠️🤖 Fenêtre vidéo repliée/dépliée par l'utilisateur");
    });
  }
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

  document.getElementById("end-session-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("end-session-btn");
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  console.log("⚠️🤖 Fin de session ⚠️🤖 room:", AppState.currentRoomId);
  try {
    SessionService.stopVideoCall(); // ✅ stopVideoCall = disconnectTwilio + endSession + terminateCall
  } finally {
    btn.disabled = false;
  }
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
// ================= REJOINDRE SESSION =================
document.getElementById("btn-rejoindre-cours")?.addEventListener("click", async () => {
  const btn = document.getElementById("btn-rejoindre-cours");
  if (!btn) return;

  const originalText = btn.innerText;

  btn.disabled = true;
  btn.innerText = "Vérification carte...";

  try {
    // 💳 1. PRE-AUTH STRIPE
    const intentId = await holdFundsForSession(3000);

    if (!intentId) {
      btn.disabled = false;
      btn.innerText = originalText;
      return;
    }

    //🔥 2. STOCKAGE GLOBAL
    window.currentPaymentIntentId = intentId;
    window.sessionStartTime = Date.now();

    btn.innerText = "Connexion...";

    // 🔥 3. LANCEMENT SESSION
    AppState.currentPaymentIntentId = intentId;
AppState.currentRoomId = AppState.currentRoomId || "room_18_32";

socketService.send({
  type: "joinRoom",
  roomId: AppState.currentRoomId,
  paymentIntentId: intentId
});
    btn.style.display = "none";

  } catch (err) {
    console.error("Erreur join session:", err);
    btn.disabled = false;
    btn.innerText = originalText;
  }
});
// ================= WHITEBOARD =================
document.getElementById("undoWhiteboardBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return;
  WhiteboardService.undo();
});

document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return;
  WhiteboardService.clearCanvas();
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

document.getElementById("pointToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return;
  setWbTool("pointToolBtn", () => WhiteboardService.setTool("point"));
});

document.getElementById("lineToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return;
  setWbTool("lineToolBtn", () => WhiteboardService.setTool?.("line"));
});

document.getElementById("rectToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return;
  setWbTool("rectToolBtn", () => WhiteboardService.setTool?.("rect"));
});

document.getElementById("circleToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return;
  setWbTool("circleToolBtn", () => WhiteboardService.setTool("circle"));
});

document.getElementById("textToolBtn")?.addEventListener("click", () => {
  if (!AppState.canUseTools) return;
  setWbTool("textToolBtn", () => WhiteboardService.setTool?.("text"));
});
  // ✅ wb-fullscreen-btn — utilise l'API Fullscreen native
document.getElementById("wb-fullscreen-btn")?.addEventListener("click", () => {
  whiteboardWrapper = whiteboardWrapper || document.getElementById("whiteboard-wrapper");
  if (!document.fullscreenElement) {
    whiteboardWrapper.requestFullscreen()
      .then(() => console.log("✅ requestFullscreen OK"))
      .catch(e => console.error("❌ requestFullscreen failed:", e));
  } else {
    document.exitFullscreen();
  }
});
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement === whiteboardWrapper) {
    if (videoMiniature) videoMiniature.style.display = "block";
    syncMiniatureStream();
    const btn = document.getElementById("wb-fullscreen-btn");
    if (btn) btn.textContent = "❌ Quitter";
  } else {
    if (videoMiniature) videoMiniature.style.display = "none";
    if (remoteVideoTrack) {
      const videoMini = document.getElementById("remote-video-mini");
      if (videoMini) remoteVideoTrack.detach(videoMini);
    }
    const btn = document.getElementById("wb-fullscreen-btn");
    if (btn) btn.textContent = "⛶";
  }
});
} // ← fermeture de bindUI()
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

  // ✅ On récupère l'utilisateur actuel depuis l'état global
  const user = AppState.currentUser;

  profs.forEach(prof => {
    const li = document.createElement("li");
    li.className = "prof-item";

    // Nom du prof — sans XSS
    const span = document.createElement("span");
    span.className = "prof-name";
    span.textContent = `${prof.prenom} ${prof.nom}`;

    // Indicateur de statut visuel
    const badge = document.createElement("span");
    badge.className = "prof-status-badge";

    const btn = document.createElement("button");
    btn.className = "call-prof-btn";

    /**
     * ✅ LOGIQUE DE DISPONIBILITÉ
     * Un prof est appelable seulement si :
     * 1. Il est marqué comme disponible (prof.disponibilite)
     * 2. L'élève a enregistré une carte (user.has_payment_method)
     */
    const canCall = prof.disponibilite && user?.has_payment_method;

    if (canCall) {
      // --- État : DISPONIBLE ---
      badge.textContent = "⚠️ Disponible";
      badge.style.color = "#3b6d11";
      btn.textContent = "Appeler";
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.style.cursor = "pointer";
      btn.onclick = () => {
        SessionService.callProfessor(prof.id);
      };
    } else {
      // --- État : INDISPONIBLE (ou carte manquante) ---
      let statusLabel = "Indisponible";
      
      if (!user?.has_payment_method) {
        statusLabel = "Carte requise";
      } else {
        statusLabel = {
          "en_session": "En session",
          "appel_reçu": "Occupé",
          "offline":    "Hors ligne",
        }[prof.status] || "Indisponible";
      }

      badge.textContent = `⚠️ ${statusLabel}`;
      badge.style.color = "#a32d2d";
      btn.textContent = user?.has_payment_method ? "Indisponible" : "⚠️ Bloqué";
      btn.disabled = true;
      btn.style.opacity = "0.45";
      btn.style.cursor = "not-allowed";
    }

    li.appendChild(span);
    li.appendChild(badge);
    li.appendChild(btn);
    list.appendChild(li);
  });
}

window.renderProfList = renderProfList;

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
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}
 
// ✅ Helper manquant — gère la classe "active" sur les boutons d'outils
function setWbTool(activeId, callback) {
  document.querySelectorAll(".wb-tool").forEach(btn => btn.classList.remove("active"));
  document.getElementById(activeId)?.classList.add("active");
  callback();
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
      remoteVideoTrack = track; // ✅ stocké pour la miniature

      const container = document.getElementById("remoteVideoContainer");
      if (!container) return;

      const el = track.attach();
      el.autoplay = true;
      el.playsInline = true;
      el.id = "remoteVideo";
      el.style.cssText = "width:100%; height:100%; object-fit:cover;";

      container.innerHTML = "";
      container.appendChild(el);

      // ✅ Si fullscreen déjà actif quand le track arrive
      if (document.fullscreenElement === whiteboardWrapper) {
        const videoMini = document.getElementById("remote-video-mini");
        if (videoMini) _doAttachMiniature(videoMini);
      }
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

  // ✅ 1. Stopper les tracks AVANT de vider le DOM
  VideoService.disconnectSilent();

  // ✅ 2. Vider explicitement les éléments vidéo locaux
  ["localVideo", "localVideoContainer"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === "VIDEO") {
        el.srcObject = null;
        el.pause?.();
      } else {
        el.querySelectorAll("video").forEach(v => {
          v.srcObject = null;
          v.pause?.();
        });
        el.innerHTML = "";
      }
    }
  });

  // ✅ 3. Vider explicitement les éléments vidéo distants
  ["remoteVideo", "remoteVideoContainer"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (el.tagName === "VIDEO") {
        el.srcObject = null;
        el.pause?.();
      } else {
        el.querySelectorAll("video").forEach(v => {
          v.srcObject = null;
          v.pause?.();
        });
        el.innerHTML = "En attente du professeur...";
      }
    }
  });
  // ✅ Arrêter le partage d'écran si actif
ScreenShareService.stop(VideoService.room).catch(() => {});
ScreenShareOverlay.hide();
const ssBtn = document.getElementById("screen-share-btn");
if (ssBtn) { ssBtn.textContent = "🖥️"; }

  // ✅ 4. Supprimer les éléments audio orphelins
  document.querySelectorAll("audio[autoplay]").forEach(a => {
    a.srcObject = null;
    a.remove();
  });

  AppState.setCallState(null);
  AppState.canUseTools = true;
  AppState.sessionInProgress = false;
  SessionService.stopTimer?.();
  updateCallStatus(message);

  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";

  WhiteboardService.reset?.();
  resetChat();

  cleanupSession._running = false; // ✅ libère le guard
}

function updateTimerUI(time) {
  const el = document.getElementById("call-time");
  if (el) el.textContent = time;
}
function updateToolButtons() {
  document.querySelectorAll(".wb-tool").forEach(btn => {
    btn.disabled = !AppState.canUseTools;
  });
}
// =============================
// STRIPE - CHECK CARTE
// =============================
function updateJoinButton(user) {
  const btn = document.getElementById("btn-rejoindre-cours");
  if (!btn) return;

  const hasPaymentMethod = !!user?.has_payment_method;

  if (!hasPaymentMethod) {
    btn.disabled = true;
    btn.innerText = "Ajoutez une carte pour rejoindre";
    btn.classList.add("is-disabled");
  } else {
    btn.disabled = false;
    btn.innerText = "Rejoindre le cours";
    btn.classList.remove("is-disabled");
  }
}
// ======================================================
// 1. GESTION DE L'INTERFACE UTILISATEUR (UI)
// ======================================================

/**
 * Rafraichit les donnees utilisateur depuis le serveur et met à jour l'UI
 */
async function refreshUI() {
  const userData = await getUserProfile();
  if (!userData) return;

  // ✅ Mettre à jour l’état global
  AppState.setCurrentUser(userData);

  // ✅ Re‐rendre l’UI avec les nouvelles infos
  renderCurrentUserInfo(userData);
  renderProfList(AppState.professors);
}
/**
 * Affiche les informations de profil et l'état des paiements Stripe
 */
function renderCurrentUserInfo(user) {
  if (!user) return;

  const { 
    prenom, nom, ville, pays, role, 
    has_payment_method, stripe_onboarding_complete 
  } = user;

  // --- 1. MISE À JOUR DES TEXTES DE PROFIL ---
  const nameEl = document.getElementById("eleve-name") || document.getElementById("user-full-name");
  const cityEl = document.getElementById("eleve-location") || document.getElementById("user-city");

  if (nameEl) nameEl.textContent = `${prenom || ""} ${nom || ""}`.trim();
  if (cityEl) cityEl.textContent = (ville && pays) ? `${ville}, ${pays}` : (ville || pays || "Lieu non précisé");

  // --- 2. PREPARATION DU CONTENU STRIPE ---
  const infoContainer = document.getElementById("user-info");
  if (!infoContainer) return;

  let stripeHTML = "";

  if (role === "eleve") {
    const config = has_payment_method ? {
        status: "success",
        icon: "✅",
        title: "Carte bancaire enregistrée",
        text: "Votre moyen de paiement est prêt pour vos prochains cours.",
        btnClass: "btn-link",
        btnText: "Mettre à jour ma carte"
    } : {
        status: "warning",
        icon: "⚠️",
        title: "Paiement requis",
        text: "Veuillez enregistrer une carte pour pouvoir appeler un professeur.",
        btnClass: "btn-primary",
        btnText: "💳 Ajouter une carte bancaire"
    };

    stripeHTML = `
      <div class="stripe-box ${config.status}">
        <p>${config.icon} <strong>${config.title}</strong></p>
        <p class="small">${config.text}</p>
        <button id="stripe-setup-btn" class="${config.btnClass}">${config.btnText}</button>
      </div>`;

  } else if (role === "prof") {
    if (stripe_onboarding_complete) {
        stripeHTML = `
          <div class="stripe-box success">
            <p>✅ <strong>Compte Stripe configuré</strong></p>
            <p class="small">Vous pouvez recevoir des paiements de vos élèves.</p>
          </div>`;
    } else {
        stripeHTML = `
          <div class="stripe-box warning">
            <p>🏦 <strong>Revenus en attente</strong></p>
            <p class="small">Configurez votre compte pour recevoir vos virements.</p>
            <button id="stripe-onboarding-btn" class="btn-primary">⚙️ Activer Stripe Connect</button>
          </div>`;
    }
  }

  // --- 3. INJECTION UNIQUE DANS LE DOM ---
  // On n'injecte qu'une seule fois pour éviter de détruire les événements
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

  // --- 4. ATTACHEMENT DES événements ---
  // On utilise .onclick pour s'assurer qu'il n'y a qu'un seul écouteur à la fois

  // Bouton Élève (Setup)
  const setupBtn = document.getElementById("stripe-setup-btn");
  if (setupBtn) {
    setupBtn.onclick = async (e) => {
      const btn = e.currentTarget;
      const originalText = btn.innerHTML;

      btn.disabled = true;
      btn.innerHTML = "🔄 Connexion sécurisée...";

      try {
        await openSetupSession();
      } catch (err) {
        console.error("Erreur Stripe:", err);
        btn.innerHTML = "❌ Erreur, réessayer";
        setTimeout(() => { 
          btn.innerHTML = originalText; 
          btn.disabled = false; 
        }, 3000);
      }
    };
  }

  // Bouton Prof (Onboarding)
  const onboardingBtn = document.getElementById("stripe-onboarding-btn");
  if (onboardingBtn) {
    onboardingBtn.onclick = async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = "🔄 Redirection...";
      try {
        await initStripeOnboarding();
      } catch (err) {
        console.error("Erreur Onboarding:", err);
        btn.disabled = false;
        btn.innerHTML = "⚙️ Activer Stripe Connect";
      }
    };
  }
}

// Garder cette ligne à la toute fin
window.renderProfList = renderProfList;
