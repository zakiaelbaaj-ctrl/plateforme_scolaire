// ======================================================
// 📎 DASHBOARD ÉTUDIANT
// Interface utilisateur et orchestration des flux
// ======================================================

import { setAuthProvider }             from "/js/lib/http.js";
import { Logger }                      from "/js/lib/logger.js";
import { AppState }                    from "/js/core/state.js";
import { eventBus }                    from "/js/core/eventBus.js";
import { EtudiantService }             from "/js/services/etudiant.service.js";
import { EtudiantSessionOrchestrator } from "/js/domains/etudiant-session/etudiant.session.orchestrator.js";
import { EtudiantMatchingService }     from "/js/domains/etudiant-session/etudiant.matching.service.js";
import { WhiteboardService }           from "/js/domains/whiteboard/whiteboard.service.js";
import { ChatService }                 from "/js/domains/chat/chat.service.js";
import { startSessionTimer, stopSessionTimer, pauseSessionTimer, resumeSessionTimer } from "/js/pages/etudiant/session.timer.js";
import { ScreenShareOverlay } from "/js/ui/components/screen.share.overlay.js";
import { refreshAccessToken } from "/js/lib/auth.refresh.js";
// ======================================================
// // AUTH — configuré UNE SEULE FOIS, en premier
// ======================================================

function clearSession() {
    localStorage.removeItem("token");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("currentUser");
    AppState.resetAll?.();
}
setAuthProvider({
    getToken:   async () => localStorage.getItem("token") || null,
    onAuthFail: async () => {
        const ok = await refreshAccessToken();
        if (ok) return true; // ✅ http.js retente automatiquement avec le nouveau token

        Logger.warn("⚠️ Session expirée, redirection...");
        clearSession();
        window.location.href = "/pages/etudiant/login.html";
        return false;
    }
});

// ======================================================
// MINI-LIBRAIRIE UI
// ======================================================

const UI = {

     _matchSound: new Audio("/assets/sounds/call.mp3"),

     _playMatchSound() {
        this._matchSound.currentTime = 0;
        this._matchSound.play().catch(err => {
            Logger.warn("⚠️ Impossible de jouer le son de notification :", err.message);
        });
    },

    toggleView(view, data = {}) {
        Logger.log(`⚠️ Vue : ${view}`);
        document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
        document.getElementById(`view-${view}`)?.classList.remove('hidden');
    },

    appendChatMessage(sender, text) {
        const box = document.getElementById('chat-box');
        if (box) {
            const p = document.createElement('p');
            p.innerHTML = `<strong>${sender}:</strong> ${text}`;
            box.appendChild(p);
            box.scrollTop = box.scrollHeight;
        }
    },

   clearVideos() {
        // 🟢 Ajout de 'remote-screen' dans le tableau de nettoyage
        ['local-video', 'remote-video', 'remote-screen'].forEach(id => {
            const v = document.getElementById(id);
            if (v) v.srcObject = null;
        });
    },

    notify(msg) {
        alert(msg);
    },
        onMatchFound(data) {
         this._playMatchSound();
         this.toggleView('session');
         const wrapper = document.getElementById('whiteboard-wrapper');
         if (wrapper) wrapper.style.display = 'block';
         WhiteboardService.initSession();
         WhiteboardService.initCanvas("whiteboard-canvas");
        const remoteInfo = document.getElementById('remote-etudiant-info');
        if (remoteInfo) remoteInfo.textContent = data?.partnerName || "—";
        const remoteLocation = document.getElementById('remote-etudiant-location');
        if (remoteLocation) {
        const lieu = [data?.partnerVille, data?.partnerPays]
            .filter(Boolean)
            .join(", ");
        remoteLocation.textContent = lieu || "—";
     } 
     // ✅ AJOUT — met à jour le badge de statut
    const statusEl = document.getElementById('call-status');
    if (statusEl) statusEl.textContent = "En session";
    const statusBadge = document.getElementById('call-status-badge');
    if (statusBadge) statusBadge.classList.add('active');   
     },

    onQueued(data) {
        this.toggleView('queue', data);
    },

    onQueueCancelled() {
        this.toggleView('home');
    },
    // 🟢 AJOUTER CETTE MÉTHODE ICI :
    onStudentsOnline(students = []) {
    const list = document.getElementById('etudiant-list');
    if (!list) return;

    list.innerHTML = "";

    if (!students.length) {
        list.innerHTML = `<li class="empty">Aucun étudiant connecté</li>`;
        return;
    }

    students.forEach(student => {
        const li = document.createElement('li');
        li.className = "etudiant-list__item";
        li.dataset.id = student.id;

        const nom = `${student.prenom || ""} ${student.nom || ""}`.trim() || "étudiant";
        const meta = [student.matiere, student.niveau]
            .filter(v => v && v !== "Général" && v !== "")
            .join(" · ");

        li.innerHTML = `
            <span class="etudiant-list__avatar">👤</span>
            <span class="etudiant-list__name">${nom}</span>
            ${meta ? `<span class="etudiant-list__meta">${meta}</span>` : ""}
        `;

        list.appendChild(li);
    });

    Logger.log(`🧹 Liste mise à jour visuellement : ${students.length} étudiant(s)`);
},
onUserLeft() {
  // 1. Toast non bloquant
  const toast = document.createElement("div");
  toast.textContent = "👋 Le partenaire a quitté la session.";
  toast.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    background: #333; color: white; padding: 12px 24px;
    border-radius: 8px; z-index: 9999; font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);

  // 2. Cleanup vidéo
  ["local-video", "remote-video"].forEach(id => {
    const v = document.getElementById(id);
    if (v) { v.srcObject = null; v.pause?.(); }
  });

  // 3. Cleanup overlay écran partagé
  ScreenShareOverlay.hide();

  // 4. Reset timer
  stopSessionTimer();
  const timerEl = document.getElementById("call-time");
  if (timerEl) timerEl.textContent = "00:00";

  // 5. Reset status
  const statusEl = document.getElementById("call-status");
  if (statusEl) statusEl.textContent = "Aucune session";
  const statusBadge = document.getElementById('call-status-badge');   // ✅ AJOUT
  if (statusBadge) statusBadge.classList.remove('active');            // ✅ AJOUT
},
// ====================================================
// 🟢 AJOUT — RECONNEXION PARTENAIRE (grâce après coupure)
// ====================================================

_reconnectCountdownInterval: null,

onPeerDisconnected({ userName, graceSeconds }) {
    const statusEl = document.getElementById('call-status');
    if (statusEl) statusEl.textContent = `⏳ ${userName} déconnecté — reconnexion en cours...`;
    const statusBadge = document.getElementById('call-status-badge');
    if (statusBadge) statusBadge.classList.remove('active');
     
    pauseSessionTimer(); // 🟢 AJOUT

     // 🟢 AJOUT — le DataChannel va être détruit (_teardownPeer), le fichier
    // ne peut plus être envoyé tant que le channel n'est pas recréé.
    const btnFile = document.getElementById('send-file');
    if (btnFile) {
        btnFile.disabled = true;
        btnFile.title = "Connexion interrompue — en attente de reconnexion...";
    }

    // 🟢 AJOUT — chat désactivé, le DataChannel est mort
    const inputChat = document.getElementById('chat-input');
    const btnSend = document.getElementById('send-msg');
    if (inputChat) {
        inputChat.disabled = true;
        inputChat.placeholder = "En attente de reconnexion...";
    }
    if (btnSend) btnSend.disabled = true;
    this._showReconnectBanner(userName, graceSeconds);
},

onPeerReconnected({ userName }) {
    const statusEl = document.getElementById('call-status');
    if (statusEl) statusEl.textContent = "En session";
    const statusBadge = document.getElementById('call-status-badge');
    if (statusBadge) statusBadge.classList.add('active');

    resumeSessionTimer(); // 🟢 AJOUT

    this._hideReconnectBanner();

    const toast = document.createElement("div");
    toast.textContent = `✅ ${userName} est de retour.`;
    toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #4CAF50; color: white; padding: 12px 24px;
        border-radius: 8px; z-index: 9999; font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
},

onCallStateChange({ state }) {
    // Ne gère QUE l'affichage du statut local (notre propre connexion WebRTC).
    // Le timer est piloté exclusivement par onPeerDisconnected/onPeerReconnected,
    // seule source fiable côté serveur pour savoir si le partenaire est vraiment absent.
    if (state === "reconnecting") {
        const statusEl = document.getElementById('call-status');
        if (statusEl) statusEl.textContent = "⏳ Reconnexion en cours...";
    } else if (state === "inCall") {
        const statusEl = document.getElementById('call-status');
        if (statusEl) statusEl.textContent = "En session";
    } else if (state === "idle") {
        const statusEl = document.getElementById('call-status');
        if (statusEl) statusEl.textContent = "Aucune session";
    }
},

_showReconnectBanner(userName, graceSeconds) {
    this._hideReconnectBanner();

    let remaining = graceSeconds;
    const banner = document.createElement("div");
    banner.id = "peer-reconnect-banner";
    banner.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: #FF9800; color: white; padding: 12px 24px;
        border-radius: 8px; z-index: 9999; font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    banner.textContent = `⏳ ${userName} s'est déconnecté — en attente de reconnexion (${remaining}s)`;
    document.body.appendChild(banner);

    this._reconnectCountdownInterval = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            this._hideReconnectBanner();
            return;
        }
        banner.textContent = `⏳ ${userName} s'est déconnecté — en attente de reconnexion (${remaining}s)`;
    }, 1000);
},

_hideReconnectBanner() {
    if (this._reconnectCountdownInterval) {
        clearInterval(this._reconnectCountdownInterval);
        this._reconnectCountdownInterval = null;
    }
    document.getElementById("peer-reconnect-banner")?.remove();
},
   onSessionReset() {
    // 1. Nettoyage vidéos
    this.clearVideos();

    // 2. Masquer le tableau blanc
    const wrapper = document.getElementById("whiteboard-wrapper");
    if (wrapper) wrapper.style.display = "none";

    // 3. Vider le champ du chat
    const inputChat = document.getElementById("chat-input");
    if (inputChat) inputChat.value = "";

    // 4. Réinitialiser le bouton de partage d'écran
    const btnScreen = document.getElementById("screen-share-btn");
    if (btnScreen) {
        btnScreen.textContent = "🖥️";
        btnScreen.title = "Partager l'écran";
    }
     const btnFile = document.getElementById("send-file");
    if (btnFile) {
        btnFile.disabled = true;
        btnFile.title = "En attente de connexion...";
    }
    
    const statusEl = document.getElementById("call-status");
    if (statusEl) statusEl.textContent = "Aucune session";

    const statusBadge = document.getElementById("call-status-badge");
    if (statusBadge) statusBadge.classList.remove("active");
    
    const remoteInfo = document.getElementById("remote-etudiant-info");
    if (remoteInfo) remoteInfo.textContent = "—";

    const remoteLocation = document.getElementById("remote-etudiant-location");
    if (remoteLocation) remoteLocation.textContent = "—";

    // 6. Retour à l'accueil
    this.toggleView("home");
},

    onSubscriptionRequired() {
        Logger.warn("⚠️ Abonnement requis");
    },

    onChatMessage({ sender, text }) {
        this.appendChatMessage(sender, text);
    },

    onDocument({ name, url }) {
        const list = document.getElementById('doc-list');
        if (!list) return;
        const li = document.createElement('li');
        li.className = 'doc-list__item';
        li.innerHTML = `<a href="${url}" download="${name}">⚠️ ${name}</a>`;
        list.appendChild(li);
    },
};

/// ======================================================
// REACTIONS AUX ÉVÉNEMENTS
// ======================================================

eventBus.on("matching:queued",    (data) => UI.toggleView('queue', data));
eventBus.on("students:online", (students) => {
    UI.onStudentsOnline(students);
});
eventBus.on("matching:cancelled", ()     => UI.toggleView('home'));

eventBus.on("student:match-found", (data) => {
    UI.notify(`Match trouvé avec ${data.partnerName} !`);
});

eventBus.on("media:local-stream", (stream) => {
    const video = document.getElementById('local-video');
    if (video) video.srcObject = stream;
});

// ✅ Écran partagé distant reçu : Gestion de l'affichage + Bouton Plein écran
// 1️⃣ PREMIER BLOC : Pour lancer le partage (Ton code mis à jour)
eventBus.on("screenshare:remote-stream", (stream) => {
    const remoteVideo = document.getElementById('remote-video');
    const remoteScreen = document.getElementById('remote-screen');
    const fullScreenBtn = document.getElementById('screen-fullscreen-btn'); 
    
    if (remoteScreen) {
        remoteScreen.srcObject = stream;
        remoteScreen.style.display = 'block';
        
        remoteScreen.onloadedmetadata = () => {
            remoteScreen.play()
                .then(() => Logger.log("✅ Lecture du partage d'écran réussie"))
                .catch(err => Logger.error("❌ Échec play() écran :", err));
        };
    }
    if (remoteVideo) {
        remoteVideo.style.display = 'none'; // Cache la caméra
    }
    
    if (fullScreenBtn) {
        fullScreenBtn.style.display = 'block'; 
        fullScreenBtn.removeAttribute('disabled');
        fullScreenBtn.style.pointerEvents = 'auto';
        fullScreenBtn.style.opacity = '1';          
    }
});

// 2️⃣ DEUXIÈME BLOC : Pour couper le partage (Gardé intact en dessous)
eventBus.on("screenshare:stopped", () => {
    const remoteVideo = document.getElementById('remote-video');
    const remoteScreen = document.getElementById('remote-screen');
    const fullScreenBtn = document.getElementById('screen-fullscreen-btn'); 
    
    if (remoteScreen) {
        remoteScreen.srcObject = null;
        remoteScreen.style.display = 'none'; // Cache l'écran
    }
    if (remoteVideo) {
        remoteVideo.style.display = 'block'; // Remet la caméra
    }
    
    if (fullScreenBtn) {
        fullScreenBtn.style.display = 'none'; // Cache le bouton plein écran
    }

    if (typeof ScreenShareOverlay !== 'undefined' && ScreenShareOverlay.hide) {
        ScreenShareOverlay.hide();
    }
    const btn = document.getElementById("screen-share-btn");
    if (btn) { btn.textContent = "🖥️"; btn.title = "Partager l'écran"; }
});
// ✅ UN SEUL handler media:remote-stream avec le timer
// ✅ APRÈS — démarre sur remote-stream ET sur connected (sécurité)
eventBus.on("media:remote-stream", (stream) => {
    const video = document.getElementById('remote-video');
    if (!video) return;
    video.srcObject = stream;
    stream.getVideoTracks().forEach(track => {
        track.onunmute = () => {
            video.srcObject = stream;
            video.play().catch(() => {});
        };
    });
    startSessionTimer();
});

/// ✅ AJOUT — filet de sécurité pour l'initiateur
eventBus.on("webrtc:state", (state) => {
    if (state === "connected") {
        startSessionTimer();
    }
});
// ================= INDICATEUR CONNEXION =================
eventBus.on("ws:status", (data) => {
  updateWsStatus(data?.status, data?.attempt);
});

// ✅ session:reset sans btnFile (géré dans setupInteractions)
eventBus.on("session:reset", () => {
    stopSessionTimer();
    UI.onSessionReset();
});
// 🟢 Écouteur global ultra-robuste pour le clic sur le bouton plein écran
document.addEventListener('click', (event) => {
    // On vérifie si l'élément cliqué est bien notre bouton plein écran
    if (event.target && event.target.id === 'screen-fullscreen-btn') {
        const remoteScreen = document.getElementById('remote-screen');
        if (!remoteScreen) return;

        Logger.log("🎯 Clic détecté sur le bouton Plein Écran");

        // Si déjà en plein écran -> on sort
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        } 
        // Sinon -> on y entre
        else {
            if (remoteScreen.requestFullscreen) {
                remoteScreen.requestFullscreen();
            } else if (remoteScreen.webkitRequestFullscreen) {
                remoteScreen.webkitRequestFullscreen();
            }
        }
    }
});

// 🟢 Met à jour le texte du bouton en fonction de l'état réel du plein écran
document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('screen-fullscreen-btn');
    if (!btn) return;
    
    if (document.fullscreenElement) {
        btn.textContent = "🗗 Réduire";
        btn.title = "Quitter le plein écran";
    } else {
        btn.textContent = "⛶ Plein écran";
        btn.title = "Plein écran";
    }
});
// ======================================================
// RENDU LISTE ETUDIANTS CONNECTES
// ======================================================
function updateWsStatus(status, attempt = 0) {
  const badge = document.getElementById("ws-status-badge");
  if (!badge) return;

  switch (status) {
    case "connected":
      badge.textContent = "🟢 Connecté";
      badge.style.color = "#4CAF50";
      break;
    case "reconnecting":
      badge.textContent = `🟡 Reconnexion... (${attempt})`;
      badge.style.color = "#FF9800";
      break;
    case "disconnected":
      badge.textContent = "🔴 Hors ligne";
      badge.style.color = "#f44336";
      break;
  }
}
// ======================================================
// INTERACTIONS DOM
// ======================================================

function setupInteractions() {
    Logger.log("🧹 Branchement des interactions UI...");

    // 1. Bouton "Trouver un étudiant"
    const btnFind      = document.getElementById('start-session-btn');
    const inputMatiere = document.getElementById('matiere');
    const inputSujet   = document.getElementById('sujet');

    if (btnFind) {
        btnFind.disabled = false;
        btnFind.addEventListener('click', () => {
            const mat = inputMatiere?.value.trim();
            const suj = inputSujet?.value.trim() || "";
            if (!mat) {
  alert("Veuillez saisir une matière.");
  return;
}

Logger.log(`🔍 Recherche lancée : ${mat}`);
            EtudiantMatchingService.enqueue(mat, suj);
        });
    } else {
        Logger.warn("⚠️ #start-session-btn introuvable dans le DOM");
    }
const btnRejoindre = document.getElementById('btn-rejoindre-cours');
if (btnRejoindre) {
    btnRejoindre.addEventListener('click', () => {
        const userId = AppState.currentUser?.id;
        const lien = `${window.location.origin}/pages/etudiant/dashboard.html?invite=${userId}`;
        
        navigator.clipboard.writeText(lien).then(() => {
            btnRejoindre.textContent = "✅ Lien copié !";
            setTimeout(() => { btnRejoindre.textContent = "▶ Rejoindre"; }, 3000);
        });
    });
}

    // 3. Chat
    const btnSend   = document.getElementById('send-msg');
    const inputChat = document.getElementById('chat-input');
    const chatBox   = document.getElementById('chat-box');
    
    if (btnSend && inputChat) {
        inputChat.disabled = false;
        
        // 🔐 Variable de contrôle pour bloquer l'écho réseau du message qu'ON vient d'envoyer
        let lastLocalText = "";

       ChatService.onMessage((msg) => {
    const sender = msg?.sender || msg?.senderName || "";
    const text = msg?.text || msg?.message || "";

    const myName = `${AppState.currentUser?.prenom || ""} ${AppState.currentUser?.nom || ""}`.trim();
    const isMine = sender === myName || sender === AppState.currentUser?.id;

    if (isMine || text === lastLocalText) {
        if (text === lastLocalText) lastLocalText = "";
        return;
    }

    UI.onChatMessage({ sender, text });
});

        const sendMessage = () => {
            const text = inputChat.value.trim();
            if (text) {
                // A. 💾 On enregistre IMMÉDIATEMENT le message dans le tampon local avant l'envoi réseau
                lastLocalText = text;

                // B. Envoi au serveur
                ChatService.sendStudent(text);
                
                // C. Affichage instantané en tant que "Moi"
                UI.onChatMessage({ sender: "Moi", text: text });
                
                // D. Reset de l'input
                inputChat.value = "";
            }
        };

        btnSend.addEventListener('click', sendMessage);
        inputChat.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); sendMessage(); }
        });
    } else {
        Logger.warn("⚠️ #send-msg ou #chat-input introuvable dans le DOM");
    }

    // 4. Bouton "Terminer la session"
    const btnEnd = document.getElementById('end-session-btn');
    if (btnEnd) {
        btnEnd.addEventListener('click', () => {
            if (confirm("Voulez-vous terminer cette session ?")) {
                EtudiantSessionOrchestrator.leaveSession();
            }
        });
    }
     // ✅ AJOUTER ICI — Swap vidéo locale/distante au clic
    document.querySelector('.video-block:not(.video-block--remote)')?.addEventListener('click', () => {
    const localVideo  = document.getElementById('local-video');
    const remoteVideo = document.getElementById('remote-video');
    const localBlock  = document.querySelector('.video-block:not(.video-block--remote)');
    const remoteBlock = document.querySelector('.video-block--remote');

    const tmpStream = localVideo.srcObject;
    localVideo.srcObject  = remoteVideo.srcObject;
    remoteVideo.srcObject = tmpStream;

    const localLabel  = localBlock.querySelector('.video-label');
    const remoteLabel = remoteBlock.querySelector('.video-label');
    const tmpText     = localLabel.textContent;
    localLabel.textContent  = remoteLabel.textContent;
    remoteLabel.textContent = tmpText;
});
    // 5. Bouton "Envoyer un fichier"
const btnFile   = document.getElementById('send-file');
const fileInput = document.getElementById('file-input');
// Zone d’affichage de la pièce jointe
const attachmentPreview = document.getElementById("attachment-preview");

if (fileInput && attachmentPreview) {
    fileInput.addEventListener("change", () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        attachmentPreview.innerHTML = `
            <div class="attachment-item">
                📎 ${file.name}
            </div>
        `;

        attachmentPreview.classList.add("has-file");
        // 🟢 AJOUT — réactive le bouton pour ce nouveau fichier,
        // uniquement si le channel draw est toujours ouvert
        if (btnFile) {
            const drawReady = window.DataChannelService?.isDrawReady?.() ?? true;
            btnFile.disabled = !drawReady;
            btnFile.title = drawReady ? "" : "En attente de connexion...";
        }
        Logger.log(`📎 Fichier prêt : ${file.name}`);
    });
}


if (btnFile && fileInput) {
    // ✅ Désactivé par défaut — le channel draw n'est pas encore ouvert
    btnFile.disabled = true;
    btnFile.title = "En attente de connexion...";

    // ✅ Activé quand le channel draw est prêt
    eventBus.on("file:channel-ready", () => {
        delete btnFile.dataset.channelClosed; // 🟢 AJOUT
        btnFile.disabled = false;
        btnFile.title = "";
        Logger.log("✅ Bouton fichier activé — channel prêt");
    });
   eventBus.on("file:channel-closed", () => {
    const btnFile = document.getElementById('send-file');
    if (btnFile) {
        btnFile.dataset.channelClosed = "true"; // 🟢 AJOUT
        btnFile.disabled = true;
        btnFile.title = "Connexion interrompue — en attente de reconnexion...";
    }
});

eventBus.on("chat:channel-closed", () => {
    const inputChat = document.getElementById('chat-input');
    const btnSend = document.getElementById('send-msg');
    if (inputChat) {
        inputChat.disabled = false;
        inputChat.placeholder = "Écrire un message (mode secours)...";
    }
    if (btnSend) btnSend.disabled = false; // On le garde actif !
    Logger.log("⚠️ Chat DataChannel fermé - Bascule transparente sur le mode secours (WS).");
});

    btnFile.addEventListener('click', () => {
        const file = fileInput.files?.[0];
        if (!file) { alert("Veuillez sélectionner un fichier."); return; }
        if (!AppState.sessionInProgress) {
            alert("Aucune session active. Rejoignez d'abord une session.");
            return;
        }
        Logger.log(`📎 Envoi fichier : ${file.name}`);
        // 🆕 Retour visuel immédiat pour l'expéditeur
    if (attachmentPreview) {
        attachmentPreview.innerHTML = `<div class="attachment-item">📤 Envoi en cours : ${file.name}...</div>`;
    }
    btnFile.disabled = true;
        EtudiantSessionOrchestrator.sendFile(file);
    });
    // dans setupInteractions(), à côté du listener existant file:channel-ready
eventBus.on("chat:channel-ready", () => {
    const inputChat = document.getElementById('chat-input');
    const btnSend = document.getElementById('send-msg');
    if (inputChat) {
        inputChat.disabled = false;
        inputChat.placeholder = "";
    }
    if (btnSend) btnSend.disabled = false;
    Logger.log("✅ Chat activé — channel prêt");
});
    // 🆕 Confirmation de fin d'envoi (si l'orchestrateur/DataChannelService émet un événement de complétion pour l'expéditeur)
    eventBus.on("file:sent", ({ name }) => {
    const attachmentPreview = document.getElementById("attachment-preview");
    if (attachmentPreview) {
        attachmentPreview.innerHTML = `<div class="attachment-item">✅ Fichier envoyé : ${name}</div>`;
    }
    const btnFile = document.getElementById('send-file');
    if (btnFile) btnFile.disabled = true; // On désactive le bouton jusqu'à ce que l'utilisateur sélectionne un nouveau fichier
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.value = "";
});
}
    // 6. Bouton "Déconnexion"
    const btnLogout = document.getElementById('logout-btn');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            Logger.log("❌ Déconnexion...");
            if (AppState.sessionInProgress) {
                EtudiantSessionOrchestrator.leaveSession();
            }
            clearSession();
            window.location.replace("/pages/etudiant/login.html");
        });
    } else {
       Logger.warn("⚠️ #logout-btn introuvable dans le DOM");
    }

    // 7. Whiteboard — initialisation dans onMatchFound, interactions ci-dessous
    // 8. Boutons whiteboard
    const wbUndo     = document.getElementById('undoWhiteboardBtn');
    const wbClear    = document.getElementById('clearWhiteboardBtn');
    const wbDownload = document.getElementById('downloadWhiteboardBtn');

    if (wbUndo)     wbUndo.addEventListener('click',     () => WhiteboardService.undo());
    if (wbClear)    wbClear.addEventListener('click',    () => WhiteboardService.clearCanvas());
    if (wbDownload) wbDownload.addEventListener('click', () => {
        const canvas = document.getElementById('whiteboard-canvas');
        if (!canvas) return;
        const link = document.createElement('a');
        link.download = 'whiteboard.png';
        link.href = canvas.toDataURL();
        link.click();
    });

    // 9. Outils whiteboard  ← AJOUTER ICI
    document.getElementById("penToolBtn")?.addEventListener("click", () => {
        setWbTool("penToolBtn", () => WhiteboardService.setTool("pen"));
    });
    document.getElementById("eraserToolBtn")?.addEventListener("click", () => {
        setWbTool("eraserToolBtn", () => WhiteboardService.setTool("eraser"));
    });
    document.getElementById("pointToolBtn")?.addEventListener("click", () => {
  setWbTool("pointToolBtn", () => WhiteboardService.setTool("point"));
});
    document.getElementById("lineToolBtn")?.addEventListener("click", () => {
        setWbTool("lineToolBtn", () => WhiteboardService.setTool("line"));
    });
    document.getElementById("rectToolBtn")?.addEventListener("click", () => {
        setWbTool("rectToolBtn", () => WhiteboardService.setTool("rect"));
    });
    document.getElementById("circleToolBtn")?.addEventListener("click", () => {
    setWbTool("circleToolBtn", () => WhiteboardService.setTool("circle"));
   });
    document.getElementById("textToolBtn")?.addEventListener("click", () => {
        setWbTool("textToolBtn", () => WhiteboardService.setTool("text"));
    });
   
    // ================= PARTAGE D'ÉCRAN =================
document.getElementById("screen-share-btn")?.addEventListener("click", async () => {
  const btn = document.getElementById("screen-share-btn");

  if (EtudiantSessionOrchestrator.isScreenSharing()) {
    await EtudiantSessionOrchestrator.stopScreenShare();
    btn.textContent = "🖥️";
    btn.title = "Partager l'écran";
 // ✅ MODIFICATION : Remplace le bloc 'else' par celui-ci
} else {
    try {
        await EtudiantSessionOrchestrator.startScreenShare();
        if (EtudiantSessionOrchestrator.isScreenSharing()) {
            btn.textContent = "⏹️";
            btn.title = "Arrêter le partage";
        }
    } catch (err) {
        Logger.error("❌ L'utilisateur a annulé ou le partage a échoué :", err);
    }
}
});
}
function setWbTool(activeId, callback) {
    document.querySelectorAll(".wb-tool").forEach(btn => btn.classList.remove("active"));
    document.getElementById(activeId)?.classList.add("active");
    callback();
}

// ======================================================
// RENDU PROFIL
// ======================================================

function renderProfile() {
    const user = AppState.currentUser;
    if (!user) return;

    const elNom      = document.getElementById('student-info');
    const elLocation = document.getElementById('etudiant-location');

    if (elNom) {
        const prenom = user.prenom || "";
        const nom    = user.nom    || "";
        elNom.textContent = `${prenom} ${nom}`.trim() || "étudiant";
    }

    if (elLocation) {
        const ville = user.ville || "";
        const pays  = user.pays  || "";
        elLocation.textContent = [ville, pays].filter(Boolean).join(", ") || "—";
    }

    Logger.log(`👪 Profil affiché : ${user.prenom} ${user.nom}`);
}

// ======================================================
// INITIALISATION DU DASHBOARD
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {
    Logger.log("🚀 Initialisation du Dashboard Étudiant");

    // 1. Charger les données de l'utilisateur — échec non bloquant
    try {
        await EtudiantService.getProfile();
        renderProfile();
    } catch (err) {
        Logger.error("❌ Échec chargement profil (poursuite quand même) :", err);
    }

    // 2. Vérifier le statut Stripe / Abonnement — échec non bloquant
    try {
        await EtudiantService.getSubscriptionStatus();
    } catch (err) {
        Logger.warn("⚠️ Échec vérification abonnement (mode dégradé) :", err);
    }
    // 3. INITIALISATION SYNC DE L'ORCHESTRATEUR — toujours exécutée,
    //    indépendamment du succès des étapes 1 et 2 ci-dessus.
    try {
        Logger.log("🎨 Liaison de l'UI à l'orchestrateur...");
        EtudiantSessionOrchestrator.init(UI);
        setupInteractions();
        
         // === Gestion du plein écran du tableau blanc ===
// === Gestion du plein écran du tableau blanc ===
const wbFullscreenBtn = document.getElementById("wb-fullscreen-btn");
const wbExitFullscreenBtn = document.getElementById("wb-exit-fullscreen-btn");
const whiteboardCard = document.querySelector(".card--whiteboard");
console.log({
    wbFullscreenBtn,
    wbExitFullscreenBtn,
    whiteboardCard
});
if (wbFullscreenBtn && wbExitFullscreenBtn && whiteboardCard) {

    // Fonction pour synchroniser l'affichage des boutons selon l'état réel
    const syncButtons = () => {
        const isFullscreen = whiteboardCard.classList.contains("whiteboard-fullscreen");
        
        if (isFullscreen) {
            wbFullscreenBtn.style.display = "none";
            wbExitFullscreenBtn.style.display = "inline-block"; // Force l'affichage
        } else {
            wbFullscreenBtn.style.display = "inline-block";
            wbExitFullscreenBtn.style.display = "none";
        }
    };

    // Un observateur qui surveille si un script tente de modifier le style du bouton Quitter
    const observer = new MutationObserver(() => {
        const isFullscreen = whiteboardCard.classList.contains("whiteboard-fullscreen");
        // Si on est en plein écran et que le bouton s'est fait masquer, on le remet
        if (isFullscreen && wbExitFullscreenBtn.style.display === "none") {
            wbExitFullscreenBtn.style.display = "inline-block";
        }
    });

    // On commence à surveiller les changements de style sur le bouton Quitter
    observer.observe(wbExitFullscreenBtn, { attributes: true, attributeFilter: ["style"] });

   // Référence pour remettre la vidéo distante à sa place initiale
    const remoteBlock = document.getElementById("remoteBlock");
    let remoteBlockOriginalParent      = remoteBlock?.parentElement || null;
    let remoteBlockOriginalNextSibling = remoteBlock?.nextElementSibling || null;

    // Activer le plein écran
    wbFullscreenBtn.addEventListener("click", () => {
        whiteboardCard.classList.add("whiteboard-fullscreen");
        syncButtons();

        // ✅ Déplace la vidéo du partenaire À L'INTÉRIEUR de la carte tableau blanc
        // (obligatoire : l'API Fullscreen native n'affiche que l'élément
        // demandé et ses descendants, rien en dehors n'est visible)
        if (remoteBlock) {
            whiteboardCard.appendChild(remoteBlock);
        }

        // ✅ Vrai plein écran natif
        if (whiteboardCard.requestFullscreen) {
            whiteboardCard.requestFullscreen();
        } else if (whiteboardCard.webkitRequestFullscreen) {
            whiteboardCard.webkitRequestFullscreen();
        }

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 0);
    });

    // Quitter le plein écran
    wbExitFullscreenBtn.addEventListener("click", () => {
        whiteboardCard.classList.remove("whiteboard-fullscreen");
        syncButtons();

        // ✅ Remet la vidéo distante à sa place d'origine dans le DOM
        if (remoteBlock && remoteBlockOriginalParent) {
            if (remoteBlockOriginalNextSibling) {
                remoteBlockOriginalParent.insertBefore(remoteBlock, remoteBlockOriginalNextSibling);
            } else {
                remoteBlockOriginalParent.appendChild(remoteBlock);
            }
        }

        // ✅ Quitter le vrai plein écran natif
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (document.webkitFullscreenElement) {
            document.webkitExitFullscreen();
        }

        setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 0);
    });
}
        // 4. 🟢 CONNEXION AU SOCKET (Le déclencheur indispensable)
        // On initie la connexion WS pour recevoir la liste des étudiants en ligne, abonnés ou non
        Logger.log("🔌 Tentative de connexion au serveur WebSocket...");
        Logger.log("🔌 WebSocket géré par l'orchestrateur.");

        // 5. Restriction visuelle si non abonné (Sans bloquer le Socket)
        if (!AppState.isSubscribed) {
            Logger.warn("⚠️ Abonnement requis pour le matchmaking (Mode consultation uniquement)");
            
            // Désactiver le bouton de recherche / mise en file d'attente
            const btnFind = document.getElementById('start-session-btn');
            if (btnFind) {
                btnFind.disabled = true;
                btnFind.title = "Veuillez enregistrer votre carte bancaire";
            }
            
            // Affichage du statut Stripe restrictif
            const stripeStatus = document.getElementById('stripe-status');
            if (stripeStatus) {
                stripeStatus.textContent = "⚠️ Enregistrez votre carte pour accéder au matching";
                stripeStatus.style.color = "orange";
            }
            return; // Fin d'exécution propre pour les non-abonnés
        }

        Logger.log("✅ Accès complet validé et orchestrateur opérationnel.");

    } catch (err) {
        Logger.error("❌ Échec critique lors de l'initialisation :", err);
    }
});