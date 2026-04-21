// public/js/call.js
// Gestion de lâ€™appel Twilio Video pour call.html

// --------------------------------------------------
// ParamÃ¨tres d'URL
// --------------------------------------------------
const urlParams = new URLSearchParams(window.location.search);
let roomName = urlParams.get("room");
console.log("ðŸ“Œ Room dÃ©tectÃ©e :", roomName);
let tokenFromUrl = urlParams.get("token") || null;

// --------------------------------------------------
// RÃ©fÃ©rences DOM
// --------------------------------------------------
const localVideoEl = document.getElementById("localVideo");
const participantsContainer = document.getElementById("participantsContainer");
const muteBtn = document.getElementById("muteBtn");
const cameraBtn = document.getElementById("cameraBtn");
const leaveBtn = document.getElementById("leaveBtn");

// --------------------------------------------------
// Variables
// --------------------------------------------------
let room = null;
let localTracks = [];
let isMuted = false;
let isCameraOff = false;

// --------------------------------------------------
// Utilitaires
// --------------------------------------------------
function getCurrentUser() {
  try {
    const raw = localStorage.getItem("currentUser");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function fetchTokenFromBackend() {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert("Utilisateur non authentifiÃ©. Retour au dashboard.");
    window.location.href = "/dashboard.html";
    return null;
  }

  if (!roomName) {
    roomName = `room_${currentUser.id || "default"}`;
  }

  try {
    const res = await fetch("http://localhost:4000/api/v1/twilio/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: roomName, userId: currentUser.id }),
    });

    if (!res.ok) {
      console.error("Erreur HTTP token Twilio:", res.status);
      return null;
    }

    const data = await res.json();
    return data.token || null;
  } catch (err) {
    console.error("Erreur rÃ©seau token Twilio:", err);
    return null;
  }
}

function attachTrackToElement(track, element) {
  detachAllTracksFromElement(element);

  const mediaEl = track.attach();
  mediaEl.style.width = "100%";
  mediaEl.style.height = "100%";
  mediaEl.style.objectFit = "cover";
  element.appendChild(mediaEl);
}

function detachAllTracksFromElement(element) {
  while (element.firstChild) {
    const node = element.firstChild;
    if (node.srcObject) node.srcObject = null;
    node.remove();
  }
}

// --------------------------------------------------
// Connexion Twilio
// --------------------------------------------------
async function startCall() {
  try {
    // RÃ©cupÃ©ration du token depuis le backend ou URL
    const token = tokenFromUrl || await fetchTokenFromBackend();
    if (!token) return;

    // CrÃ©ation des tracks locaux (audio + vidÃ©o)
    localTracks = await Twilio.Video.createLocalTracks({ audio: true, video: { width: 1280, height: 720 } });

    const localVideoTrack = localTracks.find(t => t.kind === "video");
    if (localVideoTrack) attachTrackToElement(localVideoTrack, localVideoEl);

    // Connexion Ã  la room Twilio
    room = await Twilio.Video.connect(token, { name: roomName, tracks: localTracks });

    console.log("âœ… ConnectÃ© Ã  la room:", roomName);

    // GÃ©rer les participants dÃ©jÃ  prÃ©sents
    room.participants.forEach(handleParticipantConnected);

    // Nouveaux participants
    room.on("participantConnected", handleParticipantConnected);
    room.on("participantDisconnected", handleParticipantDisconnected);
    room.on("disconnected", cleanupCall);

  } catch (err) {
    console.error("Erreur connexion Twilio:", err);
    alert("Erreur connexion visioconfÃ©rence. VÃ©rifie la console.");
  }
}

// --------------------------------------------------
// Gestion participants
// --------------------------------------------------
function handleParticipantConnected(participant) {
  console.log("Participant connectÃ©:", participant.identity);

  const participantDiv = document.createElement("div");
  participantDiv.id = participant.sid;
  participantDiv.className = "participant-video";
  participantsContainer.appendChild(participantDiv);

  // Tracks dÃ©jÃ  publiÃ©s
  participant.tracks.forEach(pub => {
    if (pub.isSubscribed && pub.track.kind === "video") attachTrackToElement(pub.track, participantDiv);
  });

  participant.on("trackSubscribed", track => {
    if (track.kind === "video") attachTrackToElement(track, participantDiv);
  });

  participant.on("trackUnsubscribed", track => {
    if (track.kind === "video") detachAllTracksFromElement(participantDiv);
  });
}

function handleParticipantDisconnected(participant) {
  console.log("Participant dÃ©connectÃ©:", participant.identity);
  const participantDiv = document.getElementById(participant.sid);
  if (participantDiv) participantDiv.remove();
}

// --------------------------------------------------
// Gestion tracks locaux
// --------------------------------------------------
function cleanupLocalTracks() {
  localTracks.forEach(track => {
    try {
      track.stop();
      track.detach();
    } catch {}
  });
  localTracks = [];
}

function toggleMute() {
  const audioTrack = localTracks.find(t => t.kind === "audio");
  if (!audioTrack) return;

  isMuted = !isMuted;
  audioTrack.enable(!isMuted);
  muteBtn.textContent = isMuted ? "Unmute" : "Mute";
}

function toggleCamera() {
  const videoTrack = localTracks.find(t => t.kind === "video");
  if (!videoTrack) return;

  isCameraOff = !isCameraOff;
  videoTrack.enable(!isCameraOff);
  cameraBtn.textContent = isCameraOff ? "Cam On" : "Cam Off";

  if (isCameraOff) detachAllTracksFromElement(localVideoEl);
  else attachTrackToElement(videoTrack, localVideoEl);
}

function leaveRoom() {
  if (room) room.disconnect();
  cleanupCall();
  window.location.href = "/dashboard.html";
}

function cleanupCall() {
  cleanupLocalTracks();
  detachAllTracksFromElement(localVideoEl);
  detachAllTracksFromElement(participantsContainer);
}

// --------------------------------------------------
// UI Listeners
// --------------------------------------------------
muteBtn.addEventListener("click", toggleMute);
cameraBtn.addEventListener("click", toggleCamera);
leaveBtn.addEventListener("click", leaveRoom);

// --------------------------------------------------
// Lancement automatique
// --------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  console.log("ðŸ“ž Initialisation de la visioconfÃ©rence Twilio...");
  startCall();
});

