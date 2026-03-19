/**
 * video.js (Dashboard Élève)
 * Gestion visio WebRTC côté élève
 * - Initialisation RTCPeerConnection
 * - Ajout flux local (caméra/micro)
 * - Réception flux distant (prof ou autres élèves)
 * - Gestion ICE candidates
 * - Partage d’écran côté élève
 */

let pc = null;
let localStream = null;

/**
 * Initialise la connexion WebRTC côté élève
 */
async function initPeerConnectionEleve() {
  if (pc) {
    console.warn('⚠️ RTCPeerConnection déjà initialisé (élève)');
    return;
  }

  console.log('🔄 Création RTCPeerConnection (élève)...');

  try {
    // Récupération des serveurs ICE (TURN/STUN)
    const response = await fetch(
      "https://urgencescolaire.metered.live/api/v1/turn/credentials?apiKey=a3f837be01a24c3ef83581addd77fc75cc48"
    );
    const iceServers = await response.json();

    pc = new RTCPeerConnection({ iceServers });

    // Demande accès caméra/micro
    console.log('🎤 Demande accès caméra/micro (élève)...');
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    console.log('✅ Flux local obtenu (élève)');

    // Attacher flux local à la vidéo
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = localStream;

    // Ajouter tracks au PeerConnection
    localStream.getTracks().forEach(track => {
      console.log('📹 Track ajouté (élève):', track.kind);
      pc.addTrack(track, localStream);
    });

    // Gestion flux distant (prof ou autres élèves)
    pc.ontrack = (ev) => {
      console.log('🎥 Flux distant reçu (élève):', ev.streams);
      if (ev.streams && ev.streams[0]) {
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) {
          remoteVideo.srcObject = ev.streams[0];
          remoteVideo.play().catch(err => {
            if (err.name !== 'AbortError') {
              console.error('❌ Erreur lecture remoteVideo (élève):', err);
            }
          });
        }
      }
    };

    // Gestion ICE candidates
    pc.onicecandidate = (ev) => {
      if (ev.candidate && currentProf && ws && ws.readyState === WebSocket.OPEN) {
        console.log('📤 Envoi ICE candidate (élève)');
        ws.send(JSON.stringify({
          type: 'ice',
          target: currentProf,
          candidate: ev.candidate
        }));
      }
    };

    // Logs des états
    pc.onconnectionstatechange = () => console.log('🔗 Connexion état (élève):', pc.connectionState);
    pc.onsignalingstatechange = () => console.log('📡 Signaling état (élève):', pc.signalingState);
    pc.oniceconnectionstatechange = () => console.log('🧊 ICE état (élève):', pc.iceConnectionState);
    pc.onicegatheringstatechange = () => console.log('📍 ICE gathering état (élève):', pc.iceGatheringState);
    pc.oniceerror = (ev) => console.error('❌ ICE error (élève):', ev);

  } catch (err) {
    console.error('❌ Erreur initPeerConnection (élève):', err);
    alert('Erreur visio élève: ' + err.message);
  }
}

/**
 * Partage d’écran côté élève
 */
async function startScreenShareEleve() {
  if (!pc) {
    alert('Connexion WebRTC non initialisée.');
    return;
  }

  try {
    console.log('🖥️ Demande partage écran (élève)...');
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    // Remplacer track vidéo par celle du partage écran
    const screenTrack = screenStream.getVideoTracks()[0];
    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) {
      sender.replaceTrack(screenTrack);
      console.log('✅ Track vidéo remplacée par partage écran (élève)');
    }

    // Afficher le flux local comme écran partagé
    const localVideo = document.getElementById('localVideo');
    if (localVideo) localVideo.srcObject = screenStream;

    // Gestion arrêt du partage
    screenTrack.onended = () => {
      console.log('🛑 Partage écran terminé (élève), retour caméra');
      if (localStream) {
        const camTrack = localStream.getVideoTracks()[0];
        if (camTrack && sender) sender.replaceTrack(camTrack);
        if (localVideo) localVideo.srcObject = localStream;
      }
    };

  } catch (err) {
    console.error('❌ Erreur partage écran (élève):', err);
    alert('Erreur partage écran élève: ' + err.message);
  }
}

// === Handlers boutons ===
document.getElementById('startVisioBtn')?.addEventListener('click', () => {
  initPeerConnectionEleve();
});

document.getElementById('shareScreenBtn')?.addEventListener('click', () => {
  startScreenShareEleve();
});
