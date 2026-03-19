document.addEventListener("DOMContentLoaded", () => {

  /* ================================
     DOM ELEMENTS
  ================================ */
  const startBtn = document.getElementById("startBtn");
  const dashboard = document.getElementById("dashboard");
  const userForm = document.getElementById("userForm");

  const roleSelect = document.getElementById("role");
  const sujetFormContainer = document.getElementById("sujetFormContainer");
  const sujetDashboardContainer = document.getElementById("sujetDashboardContainer");

  const connectBtn = document.getElementById("connectBtn");
  const disconnectBtn = document.getElementById("disconnectBtn");
  const onlineTeachersBtn = document.getElementById("onlineTeachersBtn");
  const chatBtn = document.getElementById("chatBtn");
  const docsBtn = document.getElementById("docsBtn");
  const hangupBtn = document.getElementById("hangupBtn");

  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const callTimerEl = document.getElementById("callTimer");

  let ws = null;
  let currentUser = null;
  let peer = null;
  let localStream = null;
  let currentCallTarget = null;
  let callStartTime = null;
  let timerInterval = null;

  /* ================================
     UTIL - fetch backend
  ================================ */
  async function apiFetch(path, options = {}) {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...options
    });
    if (!res.ok) throw new Error(`Erreur API: ${res.status}`);
    return await res.json();
  }

  /* ================================
     LOGIN + DASHBOARD INIT
  ================================ */
  startBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const role = roleSelect.value;
    const username = document.getElementById("usernameInput").value.trim();
    const password = document.getElementById("passwordInput").value.trim();

    if (!username || !password) return alert("Merci de remplir tous les champs.");

    try {
      // Login via backend
      const loginData = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      currentUser = {
        id: loginData.user.id,
        role: loginData.user.role,
        nom: loginData.user.nom,
        prenom: loginData.user.prenom,
        email: loginData.user.email,
        ville: loginData.user.ville || "-",
        pays: loginData.user.pays || "-",
        sujet: loginData.user.sujet || ""
      };

      // Stockage local pour refresh page
      localStorage.setItem("user", JSON.stringify(currentUser));

      // Dashboard info
      document.getElementById("nom").textContent = `${currentUser.prenom} ${currentUser.nom}`;
      document.getElementById("ville").textContent = currentUser.ville;
      document.getElementById("pays").textContent = currentUser.pays;
      document.getElementById("matiere").textContent = document.getElementById("matiereInput").value;

      if (currentUser.role === "eleve" || currentUser.role === "etudiant") {
        const sujet = document.getElementById("sujetInput").value || currentUser.sujet;
        document.getElementById("sujetDisplay").textContent = sujet;
        sujetDashboardContainer.style.display = "block";
      } else {
        sujetDashboardContainer.style.display = "none";
      }

      // Masquer formulaire, afficher dashboard
      userForm.style.display = "none";
      dashboard.style.display = "block";

      // Initialiser WebSocket
      initWebSocket();

      // Notifier serveur
      ws.send(JSON.stringify({
        type: "joinRoom",
        roomId: "global",
        userId: currentUser.id,
        role: currentUser.role,
        userName: `${currentUser.prenom} ${currentUser.nom}`
      }));

      // Récupérer liste profs/élèves depuis backend
      await refreshUsersList();

    } catch (err) {
      console.error("❌ Login error:", err);
      alert("Erreur login ou serveur");
    }
  });

  /* ================================
     Gestion rôle / sujet
  ================================ */
  function updateSujetVisibility() {
    if (roleSelect.value === "eleve" || roleSelect.value === "etudiant") {
      sujetFormContainer.style.display = "block";
    } else {
      sujetFormContainer.style.display = "none";
    }
  }
  roleSelect.addEventListener("change", updateSujetVisibility);
  updateSujetVisibility();

  /* ================================
     WebSocket + WebRTC
  ================================ */
  function initWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

   const ws = new WebSocket("ws://localhost:4000");


    ws.onopen = () => {
      console.log("✅ WebSocket connecté");
      if (currentUser) {
        ws.send(JSON.stringify({
          type: "wsReady",
          userId: currentUser.id,
          role: currentUser.role
        }));
      }
    };

    ws.onclose = () => console.log("👋 Déconnexion WebSocket");
    ws.onerror = err => console.error("❌ WebSocket error:", err);

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "onlineProfessors":
          updateUsersList(data.profs);
          break;
        case "incomingCall":
          const accept = confirm(`📞 Appel de ${data.fromName}. Accepter ?`);
          if (accept) {
            currentCallTarget = data.fromUserId;
            ws.send(JSON.stringify({ type: "acceptCall", toUserId: data.fromUserId }));
            await startWebRTC(true);
          }
          break;
        case "callAccepted":
          await startWebRTC(false);
          break;
        case "webrtcSignal":
          await handleWebRTCSignal(data);
          break;
      }
    };
  }

  /* ================================
     Appels WebRTC
  ================================ */
  async function startWebRTC(isAnswerer) {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;

    peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    localStream.getTracks().forEach(track => peer.addTrack(track, localStream));

    peer.ontrack = e => { remoteVideo.srcObject = e.streams[0]; };
    peer.onicecandidate = e => {
      if (e.candidate && currentCallTarget) {
        ws.send(JSON.stringify({ type: "webrtcSignal", targetUserId: currentCallTarget, signal: { candidate: e.candidate } }));
      }
    };
    peer.onconnectionstatechange = () => {
      if (["disconnected", "failed", "closed"].includes(peer.connectionState)) endCall();
    };

    startTimer();

    if (!isAnswerer) {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      ws.send(JSON.stringify({ type: "webrtcSignal", targetUserId: currentCallTarget, signal: { sdp: peer.localDescription } }));
    }
  }

  async function handleWebRTCSignal(data) {
    if (!peer) await startWebRTC(true);
    if (data.signal.sdp) {
      await peer.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
      if (data.signal.sdp.type === "offer") {
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "webrtcSignal", targetUserId: data.fromUserId, signal: { sdp: peer.localDescription } }));
      }
    }
    if (data.signal.candidate) await peer.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
  }

  function endCall() {
    stopTimer();
    if (peer) { peer.close(); peer = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;

    if (callStartTime && currentUser) {
      const duration = Math.floor((Date.now() - callStartTime) / 1000);
      ws.send(JSON.stringify({ type: "visioDuration", userId: currentUser.id, roomId: "global", duration }));
    }
    callStartTime = null;
  }

  /* ================================
     TIMER
  ================================ */
  function startTimer() {
    callStartTime = Date.now();
    timerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      callTimerEl.textContent = `${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerInterval);
    callTimerEl.textContent = "00:00";
  }

  /* ================================
     Boutons
  ================================ */
  connectBtn.onclick = async () => {
    await apiFetch(`/api/v1/users/profile/status`, {
      method: "POST",
      body: JSON.stringify({ status: "disponible" })
    });
    alert("🟢 Statut : disponible");
  };

  disconnectBtn.onclick = () => {
    localStorage.clear();
    location.reload();
  };

  onlineTeachersBtn.onclick = () => document.getElementById("profs").scrollIntoView({ behavior: "smooth" });
  chatBtn.onclick = () => alert("💬 Chat à venir");
  docsBtn.onclick = () => alert("📁 Documents à venir");
  hangupBtn.onclick = () => endCall();

  /* ================================
     Gestion utilisateurs (profs/élèves)
  ================================ */
 async function refreshUsersList() {
  const profs = await apiFetch("/api/v1/professeurs/online");
  updateUsersList(profs);
}

  function updateUsersList(list) {
    const container = document.getElementById("profs");
    container.innerHTML = "<h3>👨‍🏫 Professeurs en ligne</h3>";

    list.forEach(user => {
      const div = document.createElement("div");
      const color = user.status === "disponible" ? "green" : user.status === "en_appel" ? "red" : "orange";
      div.innerHTML = `
        ${user.prenom} ${user.nom}
<span style="color:${color}">(${user.status})</span>

${
  (currentUser.role === "eleve" || currentUser.role === "etudiant") && user.status === "disponible"
    ? `
        <button class="callBtn" data-id="${user.id}">Appeler</button>
        <button class="startBtn" data-id="${user.id}">Démarrer</button>
      `
    : ""
}
`;

      container.appendChild(div);
    });

    container.querySelectorAll(".callBtn").forEach(btn => {
      btn.onclick = () => {
        currentCallTarget = parseInt(btn.dataset.id, 10);
        ws.send(JSON.stringify({
          type: "callProfessor",
          profId: currentCallTarget,
          fromUserId: currentUser.id,
          fromName: currentUser.nom
        }));
      };
    });
  }

});

    // 👉 Ton code ici (visio, WebRTC, WebSocket, etc.)
async function startTwilioCall(targetId) {
  try {
    // 1. Demander un token Twilio au backend
    const res = await fetch("/api/twilio/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: `room_${targetId}`,   // nom de la room
        userId: currentUser.id      // toi
      })
    });

    const data = await res.json();
    if (!data.token) {
      console.error("❌ Impossible d’obtenir un token Twilio");
      return;
    }

    // 2. Redirection vers la page d’appel
    window.location.href = `/call.html?room=room_${targetId}&token=${data.token}`;

  } catch (err) {
    console.error("❌ Erreur Twilio :", err);
  }
}

document.addEventListener("click", async (e) => {
  if (e.target.classList.contains("startBtn")) {
    const userId = e.target.dataset.id;
    console.log("🎥 Démarrer la visio avec :", userId);

    startTwilioCall(userId);
  }
});

// === Bouton d’appel général ===
const callBtn = document.getElementById("btn-call");

if (callBtn) {
    callBtn.addEventListener("click", () => {
        const room = "classe-" + currentUser.class;
        window.location.href = `/call.html?room=${room}`;
    });
}

