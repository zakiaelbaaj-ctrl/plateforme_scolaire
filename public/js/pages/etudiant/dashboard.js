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
import { startSessionTimer, stopSessionTimer } from "/js/pages/etudiant/session.timer.js";
import { ScreenShareOverlay } from "/js/ui/components/screen.share.overlay.js";
// ======================================================
// // AUTH — configuré UNE SEULE FOIS, en premier
// ======================================================

setAuthProvider({
    getToken:   async () => localStorage.getItem("token") || null,
    onAuthFail: async () => {
        Logger.warn("⚠️ Session expirée, redirection...");
        window.location.href = "/pages/etudiant/login.html";
        return false;
    }
});

// ======================================================
// MINI-LIBRAIRIE UI
// ======================================================

const UI = {

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
        ['local-video', 'remote-video'].forEach(id => {
            const v = document.getElementById(id);
            if (v) v.srcObject = null;
        });
    },

    notify(msg) {
        alert(msg);
    },

    onMatchFound(data) {
        this.notify(`Match trouvé avec ${data.partnerName} !`);
        this.toggleView('session');
    },

    onQueued(data) {
        this.toggleView('queue', data);
    },

    onQueueCancelled() {
        this.toggleView('home');
    },

    // ❌ Avant
onUserLeft() {
  this.notify("Le partenaire a quitté la session.");
  this.toggleView('home');
},

// ✅ Après — toast non bloquant + cleanup propre
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
},

    onSessionReset() {
        this.clearVideos();
        this.toggleView('home');
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
eventBus.on("matching:cancelled", ()     => UI.toggleView('home'));

// 🟢 FUSION ICI : Un seul écouteur pour tout gérer au moment du match
eventBus.on("matching:found",     (data) => {
    // 1. Gestion de la vue (Ton code existant)
    UI.notify(`Match trouvé avec ${data.partnerName} !`);
    UI.toggleView('session');
    
    // 2. Gestion du tableau blanc (L'intégration pas à pas)
    const wrapper = document.getElementById('whiteboard-wrapper');
    if (wrapper) wrapper.style.display = 'block';
    WhiteboardService.initSession();
    WhiteboardService.initCanvas("whiteboard-canvas");
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

eventBus.on("students:online", (students) => {
    renderStudentList(students);
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

function renderStudentList(students = []) {
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

        const prenom  = student.prenom || student.name || "étudiant";
const matiere = student.matiere ? `· ${student.matiere}` : "";
const niveau  = student.niveau  ? `· ${student.niveau}`  : "";

        li.innerHTML = `
            <span class="etudiant-list__avatar">👤</span>
<span class="etudiant-list__name">${prenom}</span>
<span class="etudiant-list__meta">${matiere} ${niveau}</span>
        `;

        list.appendChild(li);
    });

    Logger.log(`🧹 Liste mise à jour : ${students.length} étudiant(s) connecté(s)`);
}
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

    // 2. Bouton "Rejoindre un cours"
    const btnRejoindre = document.getElementById('btn-rejoindre-cours');
    if (btnRejoindre) {
        btnRejoindre.addEventListener('click', () => {
            Logger.log("🎨 Rejoindre un cours");
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
            // 1. Extraction sécurisée des données
            const sender = msg?.sender || msg?.senderName || "";
            const text = msg?.text || msg?.message || "";

            // 2. 🛑 FILTRE ANTI-DOUBLON RADICAL
            // Si le message vient de moi (Sasy SOUSOU) ou s'il s'agit de l'écho exact de notre dernier message envoyé
            if (sender === "Sasy SOUSOU" || text === lastLocalText) {
                if (text === lastLocalText) lastLocalText = ""; // Nettoyage du tampon
                return; 
            }

            // 3. 👥 Si on passe le filtre, c'est le vrai message du partenaire (Fady TOUTOUT) -> On l'affiche
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
    // 5. Bouton "Envoyer un fichier"
const btnFile   = document.getElementById('send-file');
const fileInput = document.getElementById('file-input');

if (btnFile && fileInput) {
    // ✅ Désactivé par défaut — le channel draw n'est pas encore ouvert
    btnFile.disabled = true;
    btnFile.title = "En attente de connexion...";

    // ✅ Activé quand le channel draw est prêt
    eventBus.on("file:channel-ready", () => {
        btnFile.disabled = false;
        btnFile.title = "";
        Logger.log("✅ Bouton fichier activé — channel prêt");
    });

    // ✅ Désactivé quand la session se termine
    eventBus.on("session:reset", () => {
        btnFile.disabled = true;
        btnFile.title = "En attente de connexion...";
    });

    btnFile.addEventListener('click', () => {
        const file = fileInput.files?.[0];
        if (!file) { alert("Veuillez sélectionner un fichier."); return; }
        if (!AppState.sessionInProgress) {
            alert("Aucune session active. Rejoignez d'abord une session.");
            return;
        }
        Logger.log(`📎 Envoi fichier : ${file.name}`);
        EtudiantSessionOrchestrator.sendFile(file);
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
            AppState.resetAll();
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("currentUser");
            window.location.replace("/pages/etudiant/login.html");
        });
    } else {
       Logger.warn("⚠️ #logout-btn introuvable dans le DOM");
    }

    // 7. Whiteboard
    eventBus.on("student:match-found", (data) => {
        // ✅ Afficher le whiteboard
    const wrapper = document.getElementById('whiteboard-wrapper');
    if (wrapper) wrapper.style.display = 'block';
        WhiteboardService.initSession();
        WhiteboardService.initCanvas("whiteboard-canvas");
    
      });
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
    document.getElementById("wb-fullscreen-btn")?.addEventListener("click", () => {
        const wrapper = document.getElementById("whiteboard-wrapper");
        wrapper?.classList.toggle("whiteboard-fullscreen");
        WhiteboardService.resizeCanvas?.();
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
// ✅ ÉTAPE 4 : Nettoyage automatique de l'interface en fin de session
    eventBus.on("session:reset", () => {
        // 1. On masque le tableau blanc pour le prochain cours
        const wrapper = document.getElementById('whiteboard-wrapper');
        if (wrapper) wrapper.style.display = 'none';

        // 2. On vide le champ de saisie du chat pour éviter les restes de texte
        if (inputChat) inputChat.value = "";

        // 3. On remet l'icône du bouton de partage d'écran à son état initial
        const btnScreen = document.getElementById("screen-share-btn");
        if (btnScreen) {
            btnScreen.textContent = "🖥️";
            btnScreen.title = "Partager l'écran";
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
// INITIALISATION
// ======================================================

document.addEventListener("DOMContentLoaded", async () => {
    Logger.log("🚀 Initialisation du Dashboard Étudiant");

    try {
        await EtudiantService.getProfile();
        renderProfile();
        await EtudiantService.getSubscriptionStatus();
if (!AppState.isSubscribed) {
    Logger.warn("⚠️ Abonnement requis pour le matching");
    // On initialise quand même le dashboard mais on bloque le matching
    EtudiantSessionOrchestrator.init(UI);
    setupInteractions();
    
    // Désactiver uniquement le bouton de recherche
    const btnFind = document.getElementById('start-session-btn');
    if (btnFind) {
        btnFind.disabled = true;
        btnFind.title = "Veuillez enregistrer votre carte bancaire";
    }
    
    // Afficher message dans stripe-status
    const stripeStatus = document.getElementById('stripe-status');
    if (stripeStatus) {
        stripeStatus.textContent = "⚠️ Enregistrez votre carte pour accéder au matching";
        stripeStatus.style.color = "orange";
    }
    return; // ✅ garde le return pour ne pas dupliquer init
}

Logger.log("🎨 Accès autorisé, lancement de l'orchestrateur...");
EtudiantSessionOrchestrator.init(UI);
setupInteractions();

    } catch (err) {
        Logger.error("❌ Échec critique lors de l'initialisation :", err);
    }
});

