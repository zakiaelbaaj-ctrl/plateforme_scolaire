/**
 * video.js (Dashboard Professeur)
 * Gestion visio WebRTC côté professeur
 * - Initialisation RTCPeerConnection
 * - Ajout flux local (caméra/micro)
 * - Réception flux distant
 * - Partage d’écran avec retour caméra
 * - Gestion des états ICE/connexion
 */

let pc = null;
let localStream = null;

/**
 * Initialise la connexion WebRTC côté professeur
 */
async function initPeerConnection() {
  if (pc) {
    console.warn('⚠️ RTCPeerConnection déjà initialisé');
    return;
  }

  console.log('🔄 Création RTCPeerConnection (prof)...');

  try {
    // Récupération des serveurs ICE (TURN/STUN)
    const response = await fetch(
      "https://urgencescolaire.metered.live/api/v1/turn/credentials?apiKey=a3f837be01a24c3ef83581addd77fc75cc48"
    );
    const iceServers = await response.json();

    pc = new RTCPeerConnection({ iceServers });

    // Demande accès caméra/micro
    console.log('🎤 Demande accès caméra/micro (prof)...');
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log('✅ Flux local obtenu (prof)');

    // Attacher flux local à la vidéo
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = localStream;

    // Ajouter tracks au PeerConnection
    localStream.getTracks().forEach(track => {
      console.log('📹 Track ajouté:', track.kind);
      pc.addTrack(track, localStream);
    });

    // Gestion flux distant
    pc.ontrack = (ev) => {
      console.log('🎥 Flux distant reçu (prof):', ev.streams);
      if (ev.streams && ev.streams[0]) {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
          remoteVideo.srcObject = ev.streams[0];
          remoteVideo.play().catch(err => {
            if (err.name !== 'AbortError') {
              console.error('❌ Erreur lecture remoteVideo:', err);
            }
          });
        }
      }
    };

    // Gestion ICE candidates
    pc.onicecandidate = (ev) => {
      if (ev.candidate && currentEleve && ws && ws.readyState === WebSocket.OPEN) {
        console.log('📤 Envoi ICE candidate (prof)');
        ws.send(JSON.stringify({
          type: 'ice',
          target: currentEleve,
          candidate: ev.candidate
        }));
      }
    };

    // Logs des états
    pc.onconnectionstatechange = () => console.log('🔗 Connexion état (prof):', pc.connectionState);
    pc.onsignalingstatechange = () => console.log('📡 Signaling état (prof):', pc.signalingState);
    pc.oniceconnectionstatechange = () => console.log('🧊 ICE état (prof):', pc.iceConnectionState);
    pc.onicegatheringstatechange = () => console.log('📍 ICE gathering état (prof):', pc.iceGatheringState);
    pc.oniceerror = (ev) => console.error('❌ ICE error (prof):', ev);

  } catch (err) {
    console.error('❌ Erreur initPeerConnection (prof):', err);
    alert('Erreur visio: ' + err.message);
  }
}

/**
 * Partage d’écran côté professeur
 */
async function startScreenShare() {
  if (!pc) {
    alert('Connexion WebRTC non initialisée.');
    return;
  }

  try {
    console.log('🖥️ Demande partage écran (prof)...');
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    // Remplacer track vidéo par celle du partage écran
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) {
      sender.replaceTrack(screenTrack);
      console.log('✅ Track vidéo remplacée par partage écran');
    }

    // Afficher le flux local comme écran partagé
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = screenStream;

    // Gestion arrêt du partage
    screenTrack.onended = () => {
      console.log('🛑 Partage écran terminé, retour caméra');
      if (localStream) {
        const camTrack = localStream.getVideoTracks()[0];
        if (camTrack && sender) sender.replaceTrack(camTrack);
        if (localVideo) localVideo.srcObject = localStream;
      }
    };

  } catch (err) {
    console.error('❌ Erreur partage écran (prof):', err);
    alert('Erreur partage écran: ' + err.message);
  }
}

// === Handlers boutons ===
document.getElementById('startVisioBtn')?.addEventListener('click', () => {
  initPeerConnection();
});

document.getElementById('shareScreenBtn')?.addEventListener('click', () => {
  startScreenShare();
});
