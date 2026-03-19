// ======= DASHBOARD ÉLÈVE - AVEC TABLEAU BLANC COMPLET =======

let ws, twilioRoom, currentRoomId, selectedProfId, selectedProfName;
let timerInterval = null, elapsedSeconds = 0;
let callInProgress = false, inVisioRoom = false, professors = [];
let token = localStorage.getItem("token");
let currentUser = JSON.parse(localStorage.getItem("currentUser"));

// TABLEAU BLANC
let drawingCanvas, drawingContext, isDrawing = false, lastX = 0, lastY = 0;
let currentColor = "#000000", currentSize = 2, currentTool = "pen";
let strokeHistory = []; // Historique pour undo

if (!currentUser || currentUser.role !== "eleve" || !token) {
  alert("Session invalide");
  window.location.replace("login_eleve.html");
}

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  updateStudentInfo();
  initWebSocket();

  // 🔥 Bouton d'appel élève → envoie l'appel au professeur
  document.getElementById("call-button").addEventListener("click", () => {
    if (!selectedProfId) {
      alert("Sélectionne un professeur avant d’appeler !");
      return;
    }

    console.log("📞 Appel vers le professeur :", selectedProfId);

    ws.send(JSON.stringify({
      type: "callProfessor",
      profId: selectedProfId,
      eleveId: currentUser.id,
      elevePrenom: currentUser.prenom,
      eleveNom: currentUser.nom,
      eleveVille: currentUser.ville,
      elevePays: currentUser.pays
    }));

    updateCallStatus("📞 Appel en cours...");
  });

  // 🔥 Quitter la visio
  document.getElementById("btn-exit-visio").addEventListener("click", leaveSession);

  // 🔥 Chat
  document.getElementById("chatForm").addEventListener("submit", sendChat);

  // 🔥 Documents
  document.getElementById("sendDocBtn").addEventListener("click", sendDocument);
   // PARTAGE D'ÉCRAN
  document.getElementById("shareScreenBtn")?.addEventListener("click", shareScreen);
  document.getElementById("stopScreenBtn")?.addEventListener("click", stopScreenShare);

});

  // ✅ TABLEAU BLANC
  document.getElementById("initWhiteboardBtn")?.addEventListener("click", initializeWhiteboard);
  document.getElementById("clearWhiteboardBtn")?.addEventListener("click", clearWhiteboard);
  document.getElementById("downloadWhiteboardBtn")?.addEventListener("click", downloadWhiteboard);
  document.getElementById("undoWhiteboardBtn")?.addEventListener("click", undoStroke);
  
  // Couleur et taille
  document.getElementById("whiteboardColor")?.addEventListener("change", (e) => {
    currentColor = e.target.value;
  });
  
  document.getElementById("whiteboardSize")?.addEventListener("change", (e) => {
    currentSize = parseInt(e.target.value, 10);
  });
  
  document.getElementById("whiteboardTool")?.addEventListener("change", (e) => {
    currentTool = e.target.value;
  });
  
 
function updateStudentInfo() {
  document.getElementById("studentName").textContent = `${currentUser.prenom} ${currentUser.nom}`;
  document.getElementById("studentLocation").textContent = `${currentUser.ville || "?"}, ${currentUser.pays || "?"}`;
}

// ===== WEBSOCKET =====
function initWebSocket() {
  if (ws?.readyState === 1) return;
  const WS_BASE = (window.location.protocol === "https:" ? "wss://" : "ws://") + window.location.host;
  ws = new WebSocket(`${WS_BASE}?token=${encodeURIComponent(token)}`);
  
  ws.onopen = () => {
    console.log("✅ WebSocket élève connecté");
    ws.send(JSON.stringify({
      type: "identify",
      role: "eleve",
      userId: currentUser.id,
      prenom: currentUser.prenom,
      nom: currentUser.nom,
      ville: currentUser.ville,
      pays: currentUser.pays
    }));
  };

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      handleWSMessage(msg);
    } catch (err) {
      console.error("❌ Erreur WS:", err);
    }
  };

  ws.onclose = () => {
    console.warn("⚠️ WS déconnecté, reconnexion dans 3s...");
    setTimeout(initWebSocket, 3000);
  };

  ws.onerror = (err) => console.error("❌ WS erreur:", err);
}
function updateProfInfo(prof) {
  const box = document.getElementById("selectedProfInfo");
  box.classList.remove("hidden");

  document.getElementById("selectedProfName").textContent =
    `${prof.prenom} ${prof.nom}`;

  document.getElementById("selectedProfLocation").textContent =
    `${prof.ville || "?"}, ${prof.pays || "?"}`;

  document.getElementById("selectedProfTime").textContent =
    `Heure locale : ${new Date().toLocaleTimeString()}`;
}
function updateEleveSelfInfo(user) {
  document.getElementById("eleveFullName").textContent =
    `${user.prenom} ${user.nom}`;
}

function handleWSMessage(msg) {
  if (!msg?.type) return;

  switch (msg.type) {
    case "identified":
  currentUser = msg.user;
  updateEleveSelfInfo(currentUser);
  break;

    case "onlineProfessors":
  console.log("📚 Profs connectés reçus :", msg.profs);
  renderProfessors(msg.profs);
  break;

    case "callSent":
      callInProgress = true;
      updateCallStatus(`⏳ Appel en cours vers ${selectedProfName}...`);
      break;

    case "callAccepted":
  // 🔥 Mettre à jour les infos du professeur
  updateProfInfo({
    prenom: msg.profPrenom,
    nom: msg.profNom,
    ville: msg.profVille,
    pays: msg.profPays
  });

  // 🔥 Mettre à jour les variables internes
  selectedProfId = msg.profId || selectedProfId;
  selectedProfName = msg.profName;
  callInProgress = false;

  // 🔥 Message d’état
  updateCallStatus(`✅ ${msg.profName} a accepté ! Entrez en visio.`);
 // 🔥 Désactiver le bouton d’appel
  document.getElementById("call-button").disabled = true;
 document.getElementById("call-button").classList.add("disabled");

  // 🔥 Définir la room WebRTC
  currentRoomId = msg.roomId || `room_${msg.profId}_${currentUser.id}`;

  // 🔥 Démarrer la session élève
  startSession();

  // 🔥 Démarrer le timer
  startTimer();
  // 🔥 L’ÉLÈVE REJOINT LA ROOM ICI
  ws.send(JSON.stringify({
  type: "joinRoom",
  roomId: currentRoomId
}));

  break;

    case "callRejected":
      callInProgress = false;
      selectedProfId = null;
      updateCallStatus("❌ Appel rejeté");
      alert("❌ Le professeur a refusé l'appel");
      break;

    case "joinedRoom":
      inVisioRoom = true;
      console.log("🎓 Room rejointe:", msg.roomId);
      startTwilioVideo();
      break;

    case "userJoined":
      console.log("👤 Participant rejoint:", msg.userName);
      break;

    case "chatMessage":
      renderChat(msg);
      break;

    case "document":
      receiveDocument(msg);
      break;

    // ✅ TABLEAU BLANC
   case "tableauStroke":
  if (msg.data?.stroke) drawRemoteStroke(msg.data.stroke);
  break;


    case "tableauClear":
      clearWhiteboardRemote();
      break;

    case "tableauUndo":
      undoRemoteStroke();
      break;

    case "tableauSync":
      syncTableau(msg.strokes || []);
      break;

    // ✅ PARTAGE D'ÉCRAN
    case "screenShareStarted":
      console.log(`📺 ${msg.userName} partage son écran`);
      alert(`${msg.userName} partage son écran!`);
      break;

    case "screenShareStopped":
      console.log(`📺 ${msg.userName} a arrêté le partage`);
      break;

    case "error":
      console.error("❌ Erreur serveur:", msg.message);
      alert("❌ " + msg.message);
      break;
  }
}

function startSession() {
  if (!currentUser || !selectedProfId) {
    console.error("❌ Impossible de démarrer la session : prof non défini");
    return;
  }

  console.log("🎬 Session élève démarrée avec le prof", selectedProfName);

  document.getElementById("call-screen").classList.remove("hidden");
  document.getElementById("home-screen").classList.add("hidden");

  if (typeof startWebRTC === "function") {
    startWebRTC(currentRoomId);
  }
}

// ===== INTERFACE =====
function renderProfessors(profs) {
  // On garde uniquement les profs disponibles
  professors = profs.filter(p => p.status === "disponible" || p.disponibilite);

  const list = document.getElementById("profsList");
  if (!list) return;

  if (professors.length === 0) {
    list.innerHTML = "<div class='status-text'>❌ Aucun prof disponible</div>";
    return;
  }

  list.innerHTML = professors.map((p, i) => `
    <div class="prof-card">
      <strong>👨‍🏫 ${p.prenom} ${p.nom}</strong>
      <small>📍 ${p.ville || "?"}, ${p.pays || "?"}</small>
      <button type="button" onclick="selectAndCall(${i})">📞 Appeler</button>
    </div>
  `).join("");
}


function selectAndCall(index) {
  const prof = professors[index];
  if (!prof) return;

  selectedProfId = prof.id;
  selectedProfName = `${prof.prenom} ${prof.nom}`;

  console.log("📞 Appel vers :", selectedProfName);

  ws.send(JSON.stringify({
    type: "callProfessor",
    profId: selectedProfId,
    eleveId: currentUser.id,
    eleveName: `${currentUser.prenom} ${currentUser.nom}`,
    eleveVille: currentUser.ville
  }));

  updateCallStatus(`⏳ Appel vers ${selectedProfName}...`);
}


function updateCallStatus(text) {
  const panel = document.getElementById("visio-panel");
  if (!panel) return;
  const h3 = panel.querySelector("h3");
  if (h3) h3.textContent = text;
}

function openResource(url) {
  if (url !== "#ressources") {
    window.open(url, "_blank");
  }
}

// ===== APPEL =====
function callProfessor() {
  if (professors.length === 0) {
    alert("❌ Aucun professeur disponible");
    return;
  }

  if (!selectedProfId) {
    selectedProfId = professors[0].id;
    selectedProfName = `${professors[0].prenom} ${professors[0].nom}`;
  }

  console.log(`📞 Appel vers ${selectedProfName}`);
  updateCallStatus(`⏳ Appel vers ${selectedProfName}...`);

  if (ws?.readyState === 1) {
    ws.send(JSON.stringify({
      type: "callProfessor",
      profId: selectedProfId,
      eleveId: currentUser.id,
      eleveName: `${currentUser.prenom} ${currentUser.nom}`,
      eleveVille: currentUser.ville
    }));
  }
}

// ===== ENTRÉE EN VISIO =====
async function enterVisio() {
  if (!selectedProfId) {
    alert("❌ Appelez d'abord un professeur");
    return;
  }

  if (!currentRoomId) {
    alert("❌ L'appel n'a pas été accepté");
    return;
  }

  document.getElementById("panel-visio").classList.add("active");
  startTimer();

  if (ws?.readyState === 1) {
    ws.send(JSON.stringify({
      type: "joinRoom",
      roomId: currentRoomId,
      userId: currentUser.id,
      userName: `${currentUser.prenom} ${currentUser.nom}`
    }));
  }
}

async function startTwilioVideo() {
  if (!currentRoomId || !currentUser?.id || !token || !window.Twilio?.Video) {
    console.error("❌ Erreur Twilio: infos manquantes");
    return;
  }

  try {
    const res = await fetch(`${window.location.origin}/api/v1/twilio/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        room: currentRoomId,
        userId: currentUser.id,
        userName: `${currentUser.prenom} ${currentUser.nom}`
      })
    });

    const data = await res.json();
    if (!data.token) throw new Error("Token manquant");

    twilioRoom = await Twilio.Video.connect(data.token, {
      name: currentRoomId,
      audio: true,
      video: { width: 640, height: 480 }
    });

    const local = document.getElementById("local-video");
    if (local) {
      twilioRoom.localParticipant.tracks.forEach(pub => {
        if (pub.track) {
          const el = pub.track.attach();
          el.style.width = "100%";
          el.style.height = "100%";
          local.appendChild(el);
        }
      });
    }

    twilioRoom.participants.forEach(attachParticipant);
    twilioRoom.on("participantConnected", attachParticipant);
    twilioRoom.on("participantDisconnected", detachParticipant);

    document.getElementById("call-button").style.display = "none";
    updateCallStatus(`📞 En visio avec ${selectedProfName}`);

  } catch (err) {
    console.error("❌ Erreur Twilio:", err);
    alert("❌ Erreur vidéo: " + err.message);
  }
}

function attachParticipant(p) {
  const c = document.getElementById("remote-video");
  if (!c) return;
  p.tracks.forEach(pub => {
    if (pub.track) {
      const el = pub.track.attach();
      el.style.width = "100%";
      el.style.height = "100%";
      c.appendChild(el);
    }
  });
  p.on("trackSubscribed", t => {
    const el = t.attach();
    el.style.width = "100%";
    el.style.height = "100%";
    c.appendChild(el);
  });
}

function detachParticipant(p) {
  p.tracks.forEach(pub => {
    if (pub.track) pub.track.detach().forEach(el => el.remove());
  });
}

// ===== TIMER =====
function startTimer() {
  stopTimer();
  elapsedSeconds = 0;
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    const el = document.getElementById("timer");
    if (el) el.textContent = `${String(Math.floor(elapsedSeconds/60)).padStart(2,"0")}:${String(elapsedSeconds%60).padStart(2,"0")}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ===== CHAT =====
function sendChat(e) {
  e.preventDefault();
  const input = document.getElementById("chat-input");
  if (!input?.value.trim() || !currentRoomId || ws?.readyState !== 1) {
    alert("Pas de session");
    return;
  }

  ws.send(JSON.stringify({
    type: "chatMessage",
    roomId: currentRoomId,
    sender: `${currentUser.prenom} ${currentUser.nom}`,
    senderId: currentUser.id,
    text: input.value.trim()
  }));
  input.value = "";
}

function renderChat(msg) {
  const box = document.getElementById("chat-box");
  if (!box) return;
  const div = document.createElement("div");
  div.className = "chat-message";
  div.innerHTML = `<strong>${msg.sender || "User"}:</strong> ${msg.text}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

// ===== DOCUMENTS =====
function sendDocument() {
  if (!currentRoomId) {
    alert("Pas de session");
    return;
  }

  const input = document.getElementById("docInput");
  if (!input?.files?.length) {
    alert("Sélectionnez un fichier");
    return;
  }

  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    if (ws?.readyState === 1) {
      ws.send(JSON.stringify({
        type: "document",
        roomId: currentRoomId,
        fileName: file.name,
        fileData: reader.result,
        senderId: currentUser.id,
        senderName: `${currentUser.prenom} ${currentUser.nom}`
      }));
      input.value = "";
    }
  };
  reader.readAsDataURL(file);
}

function receiveDocument(data) {
  const list = document.getElementById("docList");
  if (!list) return;
  const a = document.createElement("a");
  a.href = data.fileData;
  a.download = data.fileName;
  a.className = "doc-link";
  a.innerHTML = `📄 ${data.fileName}`;
  list.appendChild(a);
}

// ===== TABLEAU BLANC =====

// 🔥 ANTI-SPAM POUR LE TABLEAU BLANC
let lastStrokeSend = 0;

function sendStroke(data) {
  const now = Date.now();
  if (now - lastStrokeSend > 100) return; // max 20 FPS
  lastStrokeSend = now;

  if (!ws || ws.readyState !== 1 || !currentRoomId) return;

  ws.send(JSON.stringify({
  type: "tableauStroke",
  data: {
    roomId: currentRoomId,
    stroke: {
      x0: data.x0,
      y0: data.y0,
      x: data.x,
      y: data.y,
      color: data.color,
      size: data.size,
      type: data.tool
    }
  }
}));
}



function initializeWhiteboard() {
  drawingCanvas = document.getElementById("whiteboard-canvas");
  if (!drawingCanvas) return;

  drawingContext = drawingCanvas.getContext("2d");
  drawingCanvas.width = drawingCanvas.offsetWidth;
  drawingCanvas.height = drawingCanvas.offsetHeight;
  
  drawingContext.fillStyle = "white";
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);

  drawingCanvas.addEventListener("mousedown", startDrawing);
  drawingCanvas.addEventListener("mousemove", draw);
  drawingCanvas.addEventListener("mouseup", stopDrawing);
  drawingCanvas.addEventListener("mouseout", stopDrawing);
  drawingCanvas.addEventListener("touchstart", handleTouch);
  drawingCanvas.addEventListener("touchmove", handleTouch);
  drawingCanvas.addEventListener("touchend", stopDrawing);

  // 🔥 SYNC DU TABLEAU
  if (ws?.readyState === 1 && currentRoomId) {
    ws.send(JSON.stringify({
      type: "tableauSync",
      roomId: currentRoomId
    }));
  }

  console.log("✏️ Tableau blanc initialisé");
}

function startDrawing(e) {
  isDrawing = true;
  const rect = drawingCanvas.getBoundingClientRect();
  lastX = e.clientX - rect.left;
  lastY = e.clientY - rect.top;
}

function draw(e) {
  if (!isDrawing) return;

  const rect = drawingCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  // 🔥 ENVOI THROTTLÉ AU SERVEUR
  sendStroke({
    x,
    y,
    x0: lastX,
    y0: lastY,
    color: currentColor,
    size: currentSize,
    tool: currentTool
  });

  // 🔥 DESSIN LOCAL
  if (currentTool === "eraser") {
    drawingContext.clearRect(
      x - currentSize,
      y - currentSize,
      currentSize * 2,
      currentSize * 2
    );
  } else {
    drawingContext.strokeStyle = currentColor;
    drawingContext.lineWidth = currentSize;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.beginPath();
    drawingContext.moveTo(lastX, lastY);
    drawingContext.lineTo(x, y);
    drawingContext.stroke();
  }

  // 🔥 MISE À JOUR DES COORDONNÉES
  lastX = x;
  lastY = y;
}

function stopDrawing() {
  isDrawing = false;
}

function handleTouch(e) {
  const touch = e.touches[0];
  const mouseEvent = new MouseEvent(e.type === "touchstart" ? "mousedown" : "mousemove", {
    clientX: touch.clientX,
    clientY: touch.clientY
  });
  drawingCanvas.dispatchEvent(mouseEvent);
}

function clearWhiteboard() {
  if (!drawingContext) return;
  drawingContext.fillStyle = "white";
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  strokeHistory = [];

  // 📤 NOTIFIER LES AUTRES
  if (ws?.readyState === 1 && currentRoomId) {
    ws.send(JSON.stringify({
      type: "tableauClear",
      roomId: currentRoomId
    }));
  }
}

function clearWhiteboardRemote() {
  if (!drawingContext) return;
  drawingContext.fillStyle = "white";
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
}

function downloadWhiteboard() {
  if (!drawingCanvas) return;
  const link = document.createElement("a");
  link.href = drawingCanvas.toDataURL("image/png");
  link.download = `tableau_${new Date().getTime()}.png`;
  link.click();
}

function undoStroke() {
  if (!drawingContext || strokeHistory.length === 0) return;
  strokeHistory.pop();

  // REDESSINER
  drawingContext.fillStyle = "white";
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  strokeHistory.forEach(stroke => drawRemoteStroke(stroke));

  // 📤 NOTIFIER LES AUTRES
  if (ws?.readyState === 1 && currentRoomId) {
    ws.send(JSON.stringify({
      type: "tableauUndo",
      roomId: currentRoomId
    }));
  }
}

function undoRemoteStroke() {
  if (!drawingContext) return;
  // Redessiner tout sauf le dernier
  drawingContext.fillStyle = "white";
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  strokeHistory.slice(0, -1).forEach(s => drawRemoteStroke(s));
}

function drawRemoteStroke(s) {
  if (!drawingContext || !s) return;

  // Définir x1/y1 si elles manquent (compatibilité prof/ancien code)
  const x1 = typeof s.x1 === "number" ? s.x1 : s.x || s.x0;
  const y1 = typeof s.y1 === "number" ? s.y1 : s.y || s.y0;

  if (s.type === "eraser") {
    drawingContext.clearRect(x1 - s.size, y1 - s.size, s.size * 2, s.size * 2);
  } else {
    drawingContext.strokeStyle = s.color || "#000000";
    drawingContext.lineWidth = s.size || 2;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.beginPath();
    drawingContext.moveTo(s.x0, s.y0);
    drawingContext.lineTo(x1, y1);
    drawingContext.stroke();
  }

  strokeHistory.push({ ...s, x1, y1 });
}

// ← Colle ici la fonction renderStroke
function renderStroke(s, remote = false) {
  if (!drawingContext || !s) return;

  const x1 = typeof s.x1 === "number" ? s.x1 : s.x || s.x0;
  const y1 = typeof s.y1 === "number" ? s.y1 : s.y || s.y0;

  if (s.type === "eraser") {
    drawingContext.clearRect(x1 - s.size, y1 - s.size, s.size * 2, s.size * 2);
  } else {
    drawingContext.strokeStyle = s.color || "#000000";
    drawingContext.lineWidth = s.size || 2;
    drawingContext.lineCap = "round";
    drawingContext.lineJoin = "round";
    drawingContext.beginPath();
    drawingContext.moveTo(s.x0, s.y0);
    drawingContext.lineTo(x1, y1);
    drawingContext.stroke();
  }

  if (!remote) strokeHistory.push({ ...s, x1, y1 });
}

function syncTableau(strokes) {
  if (!drawingContext) return;
  
  // Effacer
  drawingContext.fillStyle = "white";
  drawingContext.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  
  // Redessiner tous les strokes
  strokeHistory = [];
  strokes.forEach(stroke => drawRemoteStroke(stroke));
  
  console.log(`🔄 Tableau synchronisé: ${strokes.length} strokes`);
}


// ===== PARTAGE D'ÉCRAN =====
async function shareScreen() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: "always" },
      audio: false
    });

    const track = stream.getVideoTracks()[0];
    const streamId = stream.id;

    // 📤 NOTIFIER LES AUTRES
    if (ws?.readyState === 1 && currentRoomId) {
      ws.send(JSON.stringify({
        type: "screenShareStart",
        roomId: currentRoomId,
        streamId
      }));
    }

    // 📌 AJOUTER À TWILIO
    if (twilioRoom) {
      await twilioRoom.localParticipant.publishTrack(track);
    }

    // 🔥 Gérer la fin du partage
    track.onended = () => stopScreenShare();

    // 🔥 Mettre à jour les boutons
    document.getElementById("shareScreenBtn").classList.add("hidden");
    document.getElementById("stopScreenBtn").classList.remove("hidden");

    console.log("📺 Partage d'écran démarré");

  } catch (err) {
    console.error("❌ Erreur partage écran:", err);
    if (err.name !== "NotAllowedError") {
      alert("❌ Impossible de partager l'écran");
    }
  }
}

function stopScreenShare() {
  ws.send(JSON.stringify({
    type: "stopScreenShare",
    userName: currentUser.prenom + " " + currentUser.nom
  }));

  console.log("📺 Partage d’écran arrêté");

  document.getElementById("shareScreenBtn").classList.remove("hidden");
  document.getElementById("stopScreenBtn").classList.add("hidden");
}


// ===== QUITTER =====
function leaveSession() {
  stopTimer();
  if (twilioRoom) {
    twilioRoom.localParticipant.tracks.forEach(pub => {
      if (pub.track) {
        pub.track.stop();
        pub.track.detach().forEach(el => el.remove());
      }
    });
    twilioRoom.disconnect();
    twilioRoom = null;
  }

  if (ws?.readyState === 1 && currentRoomId && elapsedSeconds >= 5) {
    ws.send(JSON.stringify({
      type: "visioDuration",
      roomId: currentRoomId,
      duration: elapsedSeconds,
      profId: selectedProfId,
      matiere: localStorage.getItem("matiere") || "?",
      niveau: localStorage.getItem("niveau") || "?"
    }));
  }

  if (ws?.readyState === 1 && currentRoomId) {
    ws.send(JSON.stringify({
      type: "leaveRoom",
      roomId: currentRoomId,
      userId: currentUser.id
    }));
  }

  currentRoomId = null;
  selectedProfId = null;
  selectedProfName = null;
  callInProgress = false;
  inVisioRoom = false;
  elapsedSeconds = 0;

  document.getElementById("panel-visio").classList.remove("active");
  document.getElementById("call-button").style.display = "flex";
  document.getElementById("timer").textContent = "00:00";
  updateCallStatus("📞 Session Visio");
  document.getElementById("local-video").innerHTML = "";
  document.getElementById("remote-video").innerHTML = "";
  document.getElementById("chat-box").innerHTML = "";
}