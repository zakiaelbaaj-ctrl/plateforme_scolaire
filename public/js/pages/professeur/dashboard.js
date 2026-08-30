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
let deferredInstallPrompt = null;
let remoteVideoTrack = null;

const API_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:4000" 
  : "";

const API_BASE = `${API_URL}/api/v1`;
// ======================================================
// NOTIFICATIONS PUSH — "Un élève vous appelle"
// ======================================================
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ======================================================
// NOTIFICATIONS PUSH
// ======================================================
async function initPushNotifications() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.warn("⚠️ Notifications push non supportées sur ce navigateur");
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.warn("⚠️ Permission de notification refusée par le prof");
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const keyRes = await fetch(`${API_URL}/api/v1/push/vapid-public-key`);
      const { publicKey } = await keyRes.json();

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
    }

    await fetch(`${API_URL}/api/v1/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${localStorage.getItem("token")}`
      },
      body: JSON.stringify(subscription)
    });

    console.log("✅ Abonnement push enregistré côté serveur");

  } catch (err) {
    console.error("❌ Erreur initPushNotifications:", err);
  }
}
// Détection iOS + affichage d'instructions si pas déjà en PWA installée
function checkIOSInstallPrompt() {
  const isIOS = /iP(ad|hone|od)/.test(navigator.userAgent);
  const isInStandaloneMode = window.navigator.standalone === true;

  if (isIOS && !isInStandaloneMode && localStorage.getItem("iosInstallDismissed") !== "true") {
    const banner = document.createElement("div");
    banner.style.cssText = `
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: var(--ink-soft, #161310); color: var(--text-primary, #f0ead8);
      border: 1px solid var(--accent, #2196f3); padding: 14px 18px;
      border-radius: 10px; z-index: 9999; max-width: 340px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4); font-family: system-ui, sans-serif;
      font-size: 14px; display: flex; flex-direction: column; gap: 10px;
    `;
    banner.innerHTML = `
      <div>📲 <strong>Installez l'application</strong><br>
      Pour recevoir les appels même app fermée : appuyez sur <strong>Partager</strong> ⬆️ puis
      <strong>"Sur l'écran d'accueil"</strong>.</div>
      <button id="ios-install-dismiss" style="padding:8px; border-radius:6px; border:1px solid #444; background:transparent; color:#aaa; cursor:pointer;">Compris</button>
    `;
    document.body.appendChild(banner);
    document.getElementById("ios-install-dismiss").addEventListener("click", () => {
      localStorage.setItem("iosInstallDismissed", "true");
      banner.remove();
    });
  }
}
function showInstallBanner() {
  if (localStorage.getItem("installBannerDismissed") === "true") return;

  const banner = document.createElement("div");
  banner.id = "install-banner";
  banner.style.cssText = `
    position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
    background: var(--ink-soft, #161310); color: var(--text-primary, #f0ead8);
    border: 1px solid var(--accent, #2196f3); padding: 14px 18px;
    border-radius: 10px; z-index: 9999; max-width: 340px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4); font-family: system-ui, sans-serif;
    font-size: 14px; display: flex; flex-direction: column; gap: 10px;
  `;
  banner.innerHTML = `
    <div>📲 <strong>Installez l'application</strong><br>
    Pour recevoir les appels même app fermée, ajoutez cette page à votre écran d'accueil.</div>
    <div style="display:flex; gap:8px;">
      <button id="install-accept" style="flex:1; padding:8px; border-radius:6px; border:none; background:#2196f3; color:#fff; cursor:pointer;">Installer</button>
      <button id="install-dismiss" style="padding:8px 12px; border-radius:6px; border:1px solid #444; background:transparent; color:#aaa; cursor:pointer;">Plus tard</button>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById("install-accept").addEventListener("click", async () => {
    banner.remove();
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    }
  });

  document.getElementById("install-dismiss").addEventListener("click", () => {
    localStorage.setItem("installBannerDismissed", "true");
    banner.remove();
  });
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallBanner();
});
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
  // 🔴 PWA - Vérification immédiate pour iOS Safari
  checkIOSInstallPrompt();
  // 1. Gérer immédiatement le retour de Stripe (Succès/Annulation)
    handleAllStripeReturns();
  // Débloquer l'audio dès la première interaction
  document.addEventListener("click", () => {
    const audio = document.getElementById("incomingCallSound");
    if (audio) { audio.muted = false; audio.play().catch(() => {}); }
  }, { once: true });

  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/professeur/login.html"); // redirection si pas connecté
    return;
  }

 AppState.setCurrentUser(userData);
 AppState.token = localStorage.getItem("token"); // OK pour token (mais idéalement setter)
 renderCurrentUserInfo(userData);
WhiteboardService.initSession();

 // Enregistrer et attendre le SW AVANT d'afficher le bouton
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    } catch (err) {
      console.error("❌ Erreur SW register:", err.message);
    }
  // ✅ NOUVEAU — écoute les messages du SW (ex: appel entrant accepté depuis la notification)
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "INCOMING_CALL_ACCEPTED" && event.data.roomUrl) {
      window.location.href = event.data.roomUrl;
    }
  });
  }
//initPushNotifications();
// Afficher le bouton si permission pas encore accordée
const notifBtn = document.getElementById("enable-notifications-btn");
  if (notifBtn && Notification.permission !== "granted") {
    notifBtn.style.display = "block";
    notifBtn.addEventListener("click", () => {
      initPushNotifications();
      notifBtn.style.display = "none";
    });
  } else if (Notification.permission === "granted") {
    initPushNotifications();
  }

try {
  const res = await fetch(`${API_URL}/api/v1/push/disponibilite`, {
    headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
  });
  const data = await res.json();
  const dispoToggle = document.getElementById("dispoToggle");
  const dispoStatusText = document.getElementById("dispoStatusText");
  if (dispoToggle) dispoToggle.checked = data.estDisponible;
  if (dispoStatusText) dispoStatusText.textContent = data.estDisponible ? "En ligne" : "Hors ligne";
} catch (err) {
  console.error("❌ Impossible de charger la disponibilité initiale:", err);
}

  // 🔴 Si c'est un professeur, init Stripe onboarding
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

  // ✅ AJOUT : informer le prof plutôt que de cacher silencieusement
  const notice = document.createElement("div");
  notice.textContent = "ℹ️ Le partage d'écran n'est pas disponible sur cet appareil. Utilisez un ordinateur si vous souhaitez partager votre écran pendant un cours.";
  notice.style.cssText = `
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    background: #2563eb; color: white; padding: 14px 18px;
    border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    font-family: system-ui, sans-serif; font-size: 14px; max-width: 320px;
    line-height: 1.4;
  `;
  document.body.appendChild(notice);
  setTimeout(() => {
    notice.style.opacity = "0";
    notice.style.transition = "opacity 0.3s ease";
    setTimeout(() => notice.remove(), 300);
  }, 8000);
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
    case 'ended':    hideIncomingAlert(); cleanupSession('Session terminée'); break; // ✅
    case 'idle':     break; // ✅ ignore silencieusement
    // ❌ retire case null et default
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
  
  AppState.on('call:timeout', (data) => {
    console.log("⏱️ Appel expiré côté prof", data);
    hideIncomingAlert();
    updateCallStatus("En attente d'un élève…");
    AppState.currentIncomingCallEleveId = null;
  });
  // ================= CHAT =================
  AppState.on('chat:new', (msg) => renderChat(msg));

  
  // ================= WHITEBOARD =================
  WhiteboardService.onToolChange?.((remoteTool) => {
  WhiteboardService.setTool(remoteTool);
});
// ================= DOCUMENT =================

AppState.on("document:selected", (file) => {

  const preview = document.getElementById("selected-file-preview");

  if (!preview) return;

  preview.innerHTML = `📎 ${file.name}`;
});


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
  // ✅ NOUVEAU — confirmation serveur de la disponibilité
  AppState.on("availabilityUpdated", ({ estDisponible }) => {
    const dispoToggle = document.getElementById("dispoToggle");
    const dispoStatusText = document.getElementById("dispoStatusText");
    if (dispoToggle) dispoToggle.checked = estDisponible;
    if (dispoStatusText) dispoStatusText.textContent = estDisponible ? "En ligne" : "Hors ligne";
  });
  // ✅ NOUVEAU — le serveur a refusé le changement (ex: session en cours)
 AppState.on("availabilityError", ({ message }) => {
  const dispoToggle = document.getElementById("dispoToggle");
  const dispoStatusText = document.getElementById("dispoStatusText");
  if (dispoToggle) {
    dispoToggle.checked = !dispoToggle.checked; // revert
    if (dispoStatusText) dispoStatusText.textContent = dispoToggle.checked ? "En ligne" : "Hors ligne";
  }
  alert(message || "Impossible de changer votre disponibilité pour le moment.");
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
endBtn?.addEventListener("click", async () => {
  if (endBtn.disabled) return;
  endBtn.disabled = true;

  console.log("✅ Clic Terminer â roomId:", AppState.currentRoomId);

  try {
    await SessionService.stopVideoCall();
  } finally {
    endBtn.disabled = false;
  }
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

// ✅ Détecte tout appareil mobile/tactile (pas seulement iOS) —
// l'API fullscreen native affiche une bannière système peu visible sur mobile
// (Chrome Android inclus), donc on préfère systématiquement le fallback CSS
// avec notre propre bouton "Quitter" fixe et toujours visible.
const isMobileDevice = /iP(ad|hone|od)|Android/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

fullscreenBtn?.addEventListener('click', () => {
  if (isMobileDevice || !document.fullscreenEnabled) {
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
    syncMiniatureStream();
    fullscreenBtn.textContent = "❌ Quitter";
    fullscreenBtn.title = "Quitter le plein écran";
  } else {
    videoMiniature.style.display = "none";
    if (remoteVideoTrack) remoteVideoTrack.detach(videoMini);
    fullscreenBtn.textContent = "⛶";
    fullscreenBtn.title = "Plein écran";
  }
  // ✅ NOUVEAU — redimensionne le canvas à sa vraie résolution après le
  // changement de taille du wrapper (entrée ET sortie du plein écran natif).
  // Un léger délai laisse le temps au navigateur de finaliser le layout
  // avant de lire les nouvelles dimensions.
  setTimeout(() => {
    WhiteboardService._canvas?.resizeCanvas?.();
  }, 50);
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

const fileInput = document.getElementById("file-input");

fileInput?.addEventListener("change", () => {

  const file = fileInput.files[0];

  if (!file) return;

  console.log("📎 document choisi :", file.name);

  AppState._notify("document:selected", file);

});


document.getElementById("send-file")
?.addEventListener("click", sendDocument);
  // ================= VISIO =================
  // dans bindUI() :
document.getElementById("toggle-camera-btn")?.addEventListener("click", toggleCamera);
document.getElementById("toggle-mic-btn")?.addEventListener("click", toggleMic);
  // ================= LOGOUT =================
 document.getElementById("logout-btn")?.addEventListener("click", () => {
    socketService.send({ type: "logout" });
    SessionService.stopVideoCall?.();
    socketHandlerProf.destroy();
    localStorage.clear();
    window.location.href = "/pages/professeur/login.html";
  });
  // ✅ NOUVEAU — insérer ICI, juste avant l'accolade fermante de bindUI()
  // ================= DISPONIBILITÉ =================
    const dispoToggle = document.getElementById("dispoToggle");
  const dispoStatusText = document.getElementById("dispoStatusText");

    dispoToggle?.addEventListener("change", async (e) => {
    const estDisponible = e.target.checked;

    if (estDisponible && Notification.permission !== "granted") {
      await initPushNotifications();
      if (Notification.permission !== "granted") {
        dispoToggle.checked = false;
        alert("Active les notifications pour pouvoir être disponible.");
        return;
      }
    }

    // ✅ Envoi WS — la confirmation/erreur arrive via availabilityUpdated / availabilityError
    socketService.send({ type: "updateAvailability", estDisponible });
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
      case "auth-failed":
      badge.textContent = "🔴 Session expirée";
      badge.style.color = "#f44336";
      badge.title = "Reconnexion requise";
      localStorage.clear();
      window.location.replace("/pages/professeur/login.html?reason=session_expired");
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
  updateMicButton(true);
  updateCameraButton(true);
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
  if (cleanupSession._running) return;
  cleanupSession._running = true;

  // ✅ DOM partage écran
  ScreenShareOverlay.hide();
  const ssBtn = document.getElementById("screen-share-btn");
  if (ssBtn) ssBtn.textContent = "🖥️";

  // ✅ DOM vidéo
  ["remote-video", "local-video"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.srcObject = null;
  });

  // ✅ DOM session
  setSessionActive(false);
  updateCallStatus(message);
  WhiteboardService.reset?.();

  // ✅ DOM timer
  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";

  // ✅ DOM chat + canvas
  resetChat();
  clearCanvas();

  // ✅ DOM remote info
  const remoteInfo = document.getElementById("remote-eleve-info");
  if (remoteInfo) { remoteInfo.textContent = "En attente d'un élève…"; remoteInfo.style.display = ""; }

  cleanupSession._running = false;
}
// ======================================================
// CALL UI
// ======================================================

  function showIncomingCall({ eleveId, eleveName, eleveVille, elevePays, eleveClasse }) {
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
    const classe = eleveClasse ? ` (${eleveClasse})` : "";
    text.textContent = `${eleveName || "Élève"}${classe}${location}`;
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

async function toggleCamera() {
  const localParticipant = VideoService.room?.localParticipant;
  if (!localParticipant) return;

  const isEnabled = localParticipant.isCameraEnabled;
  await localParticipant.setCameraEnabled(!isEnabled);
  updateCameraButton(!isEnabled); // ✅ AJOUT — met à jour l'icône, ne change rien au comportement existant
}

// ✅ NOUVEAU — même pattern que toggleCamera, pour le micro
async function toggleMic() {
  const localParticipant = VideoService.room?.localParticipant;
  if (!localParticipant) return;

  const isEnabled = localParticipant.isMicrophoneEnabled;
  await localParticipant.setMicrophoneEnabled(!isEnabled);
  updateMicButton(!isEnabled);
}
function updateCameraButton(isEnabled) {
  const btn = document.getElementById("toggle-camera-btn");
  if (!btn) return;
  btn.textContent = isEnabled ? "📷" : "📵";
  btn.title = isEnabled ? "Couper la caméra" : "Réactiver la caméra";
}

function updateMicButton(isEnabled) {
  const btn = document.getElementById("toggle-mic-btn");
  if (!btn) return;
  btn.textContent = isEnabled ? "🎙️" : "🔇";
  btn.title = isEnabled ? "Couper le micro" : "Réactiver le micro";
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
  const card    = wrapper?.closest(".card--whiteboard");
  if (!wrapper) return;

  const isFullscreen = wrapper.classList.toggle("whiteboard-fullscreen");
  card?.classList.toggle("whiteboard-fullscreen", isFullscreen);

  if (isFullscreen) {
    if (btn) { btn.textContent = "❌"; btn.title = "Quitter le plein écran"; }
    // ✅ NOUVEAU — remplace la logique perdue de "fullscreenchange" sur mobile
    if (videoMiniature) videoMiniature.style.display = "block";
    syncMiniatureStream();
  } else {
    if (btn) { btn.textContent = "⛶"; btn.title = "Plein écran"; }
    // ✅ NOUVEAU
    if (videoMiniature) videoMiniature.style.display = "none";
    if (remoteVideoTrack) {
      const videoMini = document.getElementById('remote-video-mini');
      if (videoMini) remoteVideoTrack.detach(videoMini);
    }
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
