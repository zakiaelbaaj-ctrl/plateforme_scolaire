// ======================================================
// DASHBOARD ÉTUDIANT — COLLABORATION PEER-TO-PEER
// ✅ VERSION FINALE PRODUCTION
// ======================================================

import { AppState }               from "/js/core/state.js";
import { socketService }          from "/js/core/socket.service.js";
import { SessionServiceEtudiant } from "/js/domains/session/session.service.etudiant.js";
import { ChatService }            from "/js/domains/chat/chat.service.js";
import { WhiteboardService }      from "/js/domains/whiteboard/whiteboard.service.js";
import { DocumentService }        from "/js/domains/document/document.service.js";
import { VideoService }           from "/js/domains/call/video.service.js";
import { appendMessage, resetChat } from "/js/ui/components/chat.view.js";
import { addDocument }            from "/js/ui/components/document.view.js";
import { getUserProfile }         from "../../services/user.service.js";
import { updateToolButtons }      from "/js/domains/whiteboard/whiteboard.events.js";

// ======================================================
// ÉTAT LOCAL WebRTC
// ======================================================
let peerConnection  = null;
let iceCandidateQueue = []; // ✅ CORRECTION 3 : file d'attente ICE

const RTC_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};
// Ajouter en haut du DOMContentLoaded — TEMPORAIRE
const logDiv = document.createElement("div");
logDiv.style = "position:fixed;bottom:0;left:0;right:0;height:150px;overflow:auto;background:rgba(0,0,0,0.8);color:lime;font-size:11px;z-index:9999;padding:5px;";
document.body.appendChild(logDiv);
const origLog = console.log;
console.log = (...args) => {
    origLog(...args);
    logDiv.innerHTML += args.join(" ") + "<br>";
    logDiv.scrollTop = logDiv.scrollHeight;
};
// ======================================================
// INITIALISATION
// ======================================================
document.addEventListener("DOMContentLoaded", async () => {

  // Vérifier le token AVANT tout le reste
  const token = localStorage.getItem("token");
  if (!token) {
    window.location.replace("/pages/etudiant/login.html");
    return;
  }

  const userData = await getUserProfile();
  if (!userData) {
    window.location.replace("/pages/etudiant/login.html");
    return;
  }

  const stored = JSON.parse(localStorage.getItem("currentUser") || "{}");
  userData.matiere = stored.matiere || "";
  userData.niveau  = stored.niveau  || "";
  userData.ville   = stored.ville   || "";
  userData.pays    = stored.pays    || "";

  AppState.currentUser          = userData;
  AppState.token                = token;
  AppState.currentStudentRoomId = null;
  AppState.setCallState(null);
  AppState.sessionInProgress    = false;
  AppState.currentRoomId        = null;
  AppState.currentSessionType   = null;
  AppState.canUseTools          = false;

  renderStudentInfo();

  // ✅ CORRECTION 1 : Initialiser VideoService avant la connexion WS
  // Prépare les autorisations média en amont pour éviter le délai au moment de l'appel
  if (VideoService?.init) {
    try {
      await VideoService.init();
    } catch (err) {
      console.warn("⚠️ VideoService.init() échoué (pas de caméra ?) :", err.message);
      // Non bloquant — l'utilisateur peut quand même utiliser le chat et le whiteboard
    }
  }

  const WS_URL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
    ? `ws://localhost:4000?token=${token}`
    : `wss://plateforme-scolaire-1.onrender.com?token=${token}`;

  socketService.connect(WS_URL);

  socketService.onMessage((data) => {
    console.log("📩 reçu:", data.type);
    if (data.type?.startsWith("student:")) {
        console.error("📩 STUDENT EVENT:", data.type, JSON.stringify(data));
    }
    if (data.type === "TRANSPORT_OPEN") {
      const user = AppState.currentUser;
      socketService.send({
        type:    "identify",
        role:    "etudiant",
        prenom:  user.prenom  || "",
        nom:     user.nom     || "",
        ville:   user.ville   || "",
        pays:    user.pays    || "",
        matiere: user.matiere || "",
        niveau:  user.niveau  || ""
      });
      console.log("🚀 Identification envoyée avec le rôle:", user.role || "etudiant");
    }
    SessionServiceEtudiant._handleWs(data);
  });

  await checkSubscription();
  bindUI();
  subscribeToDomains();
  initCanvasResize();
});

// ======================================================
// CANVAS RESIZE
// ✅ CORRECTION 4 : demande une sync au WhiteboardService
// après resize plutôt que putImageData (qui décale les traits)
// ======================================================
function initCanvasResize() {
  const canvas = document.getElementById("whiteboard-canvas");
  if (!canvas) return;

  function resizeCanvas() {
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    // ✅ Demander une re-synchronisation des traits au service
    // plutôt que putImageData qui fige le contenu dans le coin
    if (AppState.currentStudentRoomId) {
      WhiteboardService.requestSync?.();
    }
  }

  resizeCanvas();

  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 150);
  });
}

// ======================================================
// DOMAIN SUBSCRIPTIONS
// ======================================================
function subscribeToDomains() {
  SessionServiceEtudiant.init(event => {
    switch (event.type) {

      case "onlineStudents":
        AppState.setOnlineStudents(event.students);
        renderStudentList(event.students);
        break;

      case "studentQueued":
        updateStatus(`⏳ Recherche en ${event.matiere}...`);
        showElement("cancel-match-btn", true);
        break;

      case "studentMatchFound":
    updateStatus(`✅ Partenaire trouvé : ${event.partnerName}`);
    AppState.currentStudentRoomId = event.roomId;
    AppState.sessionInProgress    = true;

    // 1. On récupère le wrapper et on l'affiche en premier !
    const wrapper = document.getElementById("whiteboard-wrapper");
    if (wrapper) {
        wrapper.style.display = "block"; // On le rend visible pour que le canvas ait une taille
        
        // Petit hack Senior : on attend un micro-délai pour que le navigateur calcule les dimensions
        setTimeout(() => {
            if (window.WhiteboardService) {
                // 2. Initialisation technique
                window.WhiteboardService.initCanvas("whiteboard-canvas", event.roomId);
                
                // 3. Redimensionnement forcé
                if (typeof initCanvasResize === "function") initCanvasResize();
                
                // 4. Confort visuel
                wrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
                console.log("🎨 Tableau blanc initialisé et affiché.");
            } else {
                console.error("❌ WhiteboardService introuvable sur window.");
            }
        }, 50); 
    } else {
        console.error("❌ Élément #whiteboard-wrapper introuvable dans le HTML.");
    }
    break;

      case "studentJoinedRoom":
        updateStatus("🎬 Room rejointe — en attente de l'autre étudiant...");
        break;

      case "studentUserJoined":
        updateStatus(`👤 ${event.userName} a rejoint la session`);
        break;

      case "studentSessionReady":
        updateStatus("📡 Connexion vidéo...");
        startPeerConnection(event.initiator);
        break;

      case "studentSignal":
        handleIncomingSignal(event.signal);
        break;

      case "studentUserLeft":
        cleanupPeerSession("Partenaire déconnecté.");
        break;

      case "studentChatMessage":
        appendMessage(event.sender, event.text);
        break;

      case "studentDocument":
        addDocument({
          id:       event.fileName,
          name:     event.fileName,
          fileData: event.fileData
        });
        break;

      case "noSubscription":
        showElement("subscription-banner", true);
        showElement("subscribe-btn", true);
        updateStatus("🔒 Abonnement requis pour le matching étudiant.");
        break;
    }
  });

  ChatService.onMessage(msg => appendMessage(msg.sender, msg.text));

  DocumentService.onDocument(doc => addDocument({
    id:       doc.id       || doc.fileName,
    name:     doc.fileName || doc.name,
    fileData: doc.fileData
  }));

  WhiteboardService.onStroke(drawStroke);
  WhiteboardService.onText(drawText);
  WhiteboardService.onClear(clearCanvas);
  WhiteboardService.onSync(strokes => {
    clearCanvas();
    strokes.forEach(s => s.text ? drawText(s) : drawStroke(s));
  });
}

// ======================================================
// UI BINDINGS
// ======================================================
function bindUI() {
  const wb = WhiteboardService; // Utilise l'import déjà présent en haut du fichier

  document.getElementById("start-session-btn")?.addEventListener("click", () => {
    const m = document.getElementById("matiere")?.value;
    const s = document.getElementById("sujet")?.value || "";
    if (m) SessionServiceEtudiant.enqueue(m, s);
  });

  document.getElementById("cancel-match-btn")?.addEventListener("click", () => {
    SessionServiceEtudiant.dequeue();
    showElement("cancel-match-btn", false);
  });

  document.getElementById("subscribe-btn")?.addEventListener("click", () => {
    SessionServiceEtudiant.subscribe(AppState.token, "monthly");
  });

  document.getElementById("end-session-btn")?.addEventListener("click", () => {
    SessionServiceEtudiant.leaveRoom();
    cleanupPeerSession("Session terminée.");
  });

  document.getElementById("send-msg")?.addEventListener("click", sendChat);
  document.getElementById("chat-input")?.addEventListener("keydown", e => {
    if (e.key === "Enter") sendChat();
  });

  document.getElementById("send-file")?.addEventListener("click", sendDocument);

  // --- CONFIGURATION WHITEBOARD ---
  const tools = ["pen", "eraser", "line", "rect", "text"];
  tools.forEach(tool => {
    const btn = document.getElementById(`${tool}ToolBtn`);
    btn?.addEventListener("click", () => {
      wb.setTool?.(tool);
      // Mise à jour visuelle des boutons (classe active)
      document.querySelectorAll('.wb-tool').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => {
    if(confirm("Effacer tout le tableau ?")) wb.clearBoard?.();
  });

  document.getElementById("undoWhiteboardBtn")?.addEventListener("click", () => {
    wb.undo?.();
  });

  // Personnalisation Couleur et Taille
  document.getElementById("whiteboardColor")?.addEventListener("change", (e) => {
    wb.setColor?.(e.target.value);
  });

  document.getElementById("whiteboardSize")?.addEventListener("input", (e) => {
    wb.setLineWidth?.(e.target.value);
  });

  // --- LOGOUT ---
  document.getElementById("logout-btn")?.addEventListener("click", logout);

  // Exposer les fonctions critiques au scope global
  window.logout = logout;
  window.sendChat = sendChat;
}

// ======================================================
// WebRTC LOGIC
// ======================================================
async function startPeerConnection(initiator) {
  if (peerConnection) peerConnection.close();
  iceCandidateQueue = []; // ✅ Vider la file ICE à chaque nouvelle connexion
  peerConnection    = new RTCPeerConnection(RTC_CONFIG);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    stream.getTracks().forEach(track => peerConnection.addTrack(track, stream));
    attachVideo("localVideoContainer", stream, true);
  } catch (err) {
    updateStatus("❌ Média inaccessible.");
  }

  peerConnection.ontrack = (e) => attachVideo("remoteVideo", e.streams[0], false);

  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      SessionServiceEtudiant.sendSignal({ type: "ice-candidate", candidate: e.candidate });
    }
  };

  peerConnection.onco
  document.getElementById("clearWhiteboardBtn")?.addEventListener("click", () => {
    WhiteboardService.clearBoard?.();
  });

  document.getElementnnectionstatechange = () => {
    const state = peerConnection?.connectionState;
    if (state === "connected")    updateStatus("🟢 Connexion vidéo établie");
    if (state === "disconnected") cleanupPeerSession("Connexion perdue.");
    if (state === "failed")       cleanupPeerSession("Échec de connexion vidéo.");
  };

  if (initiator) {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    SessionServiceEtudiant.sendSignal({ type: "offer", sdp: offer.sdp });
  }
}

// ✅ CORRECTION 3 : File d'attente ICE
// Les candidats ICE peuvent arriver avant que setRemoteDescription soit terminé.
// On les met en file et on les applique une fois la remote description prête.
async function handleIncomingSignal(signal) {
  if (!peerConnection) return;

  try {
    if (signal.type === "offer") {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));

      // Appliquer les candidats ICE mis en attente
      for (const candidate of iceCandidateQueue) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidateQueue = [];

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      SessionServiceEtudiant.sendSignal({ type: "answer", sdp: answer.sdp });

    } else if (signal.type === "answer") {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));

      // Appliquer les candidats ICE mis en attente
      for (const candidate of iceCandidateQueue) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      iceCandidateQueue = [];

    } else if (signal.type === "ice-candidate") {
      // Si la remote description n'est pas encore définie → mettre en file
      if (!peerConnection.remoteDescription) {
        iceCandidateQueue.push(signal.candidate);
      } else {
        await peerConnection.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    }
  } catch (err) {
    console.error("❌ Erreur signal WebRTC:", err);
  }
}

// ======================================================
// LOGOUT
// ======================================================
function logout() {
  SessionServiceEtudiant.leaveRoom();
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  AppState.currentStudentRoomId = null;
  AppState.sessionInProgress    = false;
  localStorage.clear();
  window.location.href = "/pages/etudiant/login.html";
}

// ======================================================
// HELPERS
// ======================================================
function cleanupPeerSession(msg) {
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  iceCandidateQueue             = [];
  AppState.currentStudentRoomId = null;
  AppState.sessionInProgress    = false;
  const remote = document.getElementById("remoteVideo");
  const local  = document.getElementById("localVideoContainer");
  if (remote) remote.srcObject = null;
  if (local)  local.innerHTML  = "";
  showElement("cancel-match-btn", false);
  updateStatus(msg);
  resetChat();
}

function sendChat() {
  const input = document.getElementById("chat-input");
  if (input?.value.trim()) {
    SessionServiceEtudiant.sendChat(input.value.trim());
    input.value = "";
  }
}

function sendDocument() {
  const input = document.getElementById("file-input");
  const file  = input?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => SessionServiceEtudiant.sendDocument(file.name, e.target.result);
  reader.readAsDataURL(file);
}

function drawStroke(s) {
  const ctx = document.getElementById("whiteboard-canvas")?.getContext("2d");
  if (!ctx) return;
  ctx.strokeStyle = s.color; ctx.lineWidth = s.size; ctx.lineCap = "round";
  if (s.type === "start") { ctx.beginPath(); ctx.moveTo(s.x, s.y); }
  else { ctx.lineTo(s.x, s.y); ctx.stroke(); }
}

function drawText(s) {
  const ctx = document.getElementById("whiteboard-canvas")?.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = s.color;
  ctx.font      = `${s.size * 5}px sans-serif`;
  ctx.fillText(s.text, s.x, s.y);
}

function clearCanvas() {
  const c = document.getElementById("whiteboard-canvas");
  c?.getContext("2d").clearRect(0, 0, c.width, c.height);
}

function attachVideo(elementId, stream, isLocal) {
  const container = document.getElementById(elementId);
  if (!container) return;
  let video = container.tagName === "VIDEO" ? container : container.querySelector("video");
  if (!video) {
    video             = document.createElement("video");
    video.autoplay    = true;
    video.playsInline = true;
    if (isLocal) video.muted = true;
    container.appendChild(video);
  }
  video.srcObject = stream;
}

function updateStatus(text) {
  const el = document.getElementById("call-status");
  if (el) el.textContent = text;
}

function updateTimerUI(time) {
  const el = document.getElementById("call-time");
  if (el) el.textContent = time;
}

function showElement(id, show) {
  const el = document.getElementById(id);
  if (el) el.style.display = show ? "inline-block" : "none";
}

function renderStudentInfo() {
  const el = document.getElementById("student-info");
  if (el) el.textContent = `${AppState.currentUser.prenom} ${AppState.currentUser.nom}`;
}

function renderStudentList(students = []) {
  const list = document.getElementById("etudiant-list");
  if (!list) return;

  list.innerHTML = "";

  // 1. Filtrer pour exclure l'utilisateur actuel
  const filtered = students.filter(s => s.id !== AppState.currentUser.id);

  // 2. Afficher un message si personne n'est en ligne
  if (filtered.length === 0) {
    list.innerHTML = `<li class="empty-list">Aucun autre étudiant en ligne</li>`;
    return;
  }

  // --- AJOUT DU MESSAGE D'AIDE (UI/UX Senior) ---
  // On crée un petit bandeau informatif discret
  const infoMsg = document.createElement("li");
  infoMsg.className = "list-helper-msg";
  infoMsg.innerHTML = `
    <i class="fas fa-info-circle"></i> 
    Mets-toi en file d'attente pour la même matière, vous serez matchés automatiquement.
  `;
  list.appendChild(infoMsg);
  // ----------------------------------------------

  // 3. Générer la liste des étudiants
  filtered.forEach(s => {
    const li = document.createElement("li");
    
    li.innerHTML = `
      <span class="status-indicator"></span>
      <span>${s.prenom} <small class="badge-matiere">${s.matiere || 'Général'}</small></span>
      <button class="btn-match-invite">Inviter</button>
    `;

    // Au clic, on lance le matching pour la matière cible
    li.querySelector("button").onclick = () => {
    const btn = li.querySelector("button");
    
    // Feedback visuel immédiat
    btn.innerText = "⌛ En attente...";
    btn.style.backgroundColor = "var(--text-muted)"; // Devient gris pour montrer l'attente
    btn.disabled = true; 
    
    // On met à jour le statut global pour rassurer l'étudiant
    updateStatus(`Recherche de partenaire en ${s.matiere || 'Général'}...`);

    // Envoi au serveur
    SessionServiceEtudiant.enqueue(s.matiere || "Général");
};

    list.appendChild(li);
  });
}
async function checkSubscription() {
  try {
    const res  = await fetch("/api/v1/stripe-student/status", {
      headers: { Authorization: `Bearer ${AppState.token}` }
    });
    const data = await res.json();
    if (data.status !== "active") {
      showElement("subscription-banner", true);
      showElement("subscribe-btn", true);
    }
  } catch (e) {
    console.error("Subscription check failed", e);
  }
}