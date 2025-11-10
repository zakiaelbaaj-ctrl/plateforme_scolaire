// --- Auth Élève ---
function login() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    if(!username || !password) return alert("Remplir tous les champs");

    const eleves = JSON.parse(localStorage.getItem("eleves") || "[]");
    let eleve = eleves.find(e => e.username === username && e.password === password);
    if(!eleve) { 
        alert("Utilisateur inconnu"); 
        return; 
    }
    localStorage.setItem("eleveConnecte", JSON.stringify(eleve));
    window.location.href = "/eleve_dashboard.html";
}

// --- Dashboard Élève ---
if(window.location.pathname.endsWith("eleve_dashboard.html")) {
    let eleve = JSON.parse(localStorage.getItem("eleveConnecte"));
    if(!eleve) window.location.href = "/login_eleve.html";

    const ws = new WebSocket("ws://localhost:3000");
    ws.onopen = () => ws.send(JSON.stringify({type: 'register', username: eleve.username}));

    ws.onerror = (error) => {
        console.error("Erreur WebSocket:", error);
        alert("Erreur de connexion au serveur");
    };

    const chatBox = document.getElementById("chatBox");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const chatInput = document.getElementById("chatInput");
    
    let pc = null;
    let selectedProf = null;
    let visioActive = false;

    // --- Afficher les professeurs disponibles ---
    const profList = document.getElementById("liste-profs");
    function afficherProfs() {
        const profs = JSON.parse(localStorage.getItem("professeurs") || "[]");
        profList.innerHTML = "";
        
        profs.forEach(p => {
            if(p.statut === "validé" && p.disponible) {
                const li = document.createElement("li");
                li.textContent = p.username;
                
                const btn = document.createElement("button");
                btn.textContent = selectedProf === p.username ? "✓ Sélectionné" : "Sélectionner";
                btn.onclick = () => {
                    selectedProf = p.username;
                    
                    if(!p.salleAttente) p.salleAttente = [];
                    if(!p.salleAttente.includes(eleve.username)) {
                        p.salleAttente.push(eleve.username);
                        localStorage.setItem("professeurs", JSON.stringify(profs));
                        alert(`Vous avez rejoint la salle d'attente de ${p.username}`);
                    }
                    
                    document.getElementById("btnStartVisio").disabled = false;
                    chatInput.disabled = false;
                    afficherProfs();
                };
                
                li.appendChild(btn);
                profList.appendChild(li);
            }
        });
    }
    setInterval(afficherProfs, 2000);

    // --- Démarrer la visio ---
    document.getElementById("btnStartVisio").onclick = async () => {
        if(!selectedProf) return alert("Sélectionner un professeur d'abord");
        
        try {
            pc = new RTCPeerConnection({
                iceServers: [{urls: ['stun:stun.l.google.com:19302']}]
            });
            
            const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
            localVideo.srcObject = stream;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            
            pc.ontrack = e => remoteVideo.srcObject = e.streams[0];
            
            pc.onicecandidate = e => {
                if(e.candidate) {
                    ws.send(JSON.stringify({
                        type: 'ice',
                        candidate: e.candidate,
                        target: selectedProf,
                        sender: eleve.username
                    }));
                }
            };
            
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({
                type: 'offer',
                offer,
                target: selectedProf,
                sender: eleve.username
            }));
            
            visioActive = true;
            document.getElementById("videoContainer").style.display = "block";
            document.getElementById("btnStartVisio").disabled = true;
            document.getElementById("btnStopVisio").disabled = false;
            document.getElementById("btnSendChat").disabled = false;
        } catch(error) {
            console.error("Erreur démarrage visio:", error);
            alert("Erreur: " + error.message);
        }
    };

    // --- Arrêter la visio ---
    window.stopVisio = () => {
        if(pc) {
            pc.close();
            pc = null;
        }
        if(localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }
        remoteVideo.srcObject = null;
        visioActive = false;
        
        document.getElementById("videoContainer").style.display = "none";
        document.getElementById("btnStartVisio").disabled = false;
        document.getElementById("btnStopVisio").disabled = true;
        document.getElementById("btnSendChat").disabled = true;
        chatBox.innerHTML = "";
    };

    // --- WebSocket Messages ---
    ws.onmessage = async msg => {
        const data = JSON.parse(msg.data);
        
        if(data.type === 'answer' && pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
            } catch(error) {
                console.error("Erreur setRemoteDescription:", error);
            }
        } 
        else if(data.type === 'ice' && pc) {
            try {
                if(data.candidate) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                }
            } catch(error) {
                console.error("Erreur ICE:", error);
            }
        } 
        else if(data.type === 'chat') {
            const msgDiv = document.createElement("div");
            msgDiv.className = "chat-message";
            msgDiv.innerHTML = `<b>${data.sender}:</b> ${data.message}`;
            chatBox.appendChild(msgDiv);
            chatBox.scrollTop = chatBox.scrollHeight;
        }
    };

    // --- Envoyer Chat ---
    window.envoyerChat = () => {
        const input = document.getElementById("chatInput");
        if(!input.value || !selectedProf) return;
        
        ws.send(JSON.stringify({
            type: 'chat',
            message: input.value,
            sender: eleve.username,
            target: selectedProf
        }));
        
        const msgDiv = document.createElement("div");
        msgDiv.className = "chat-message mine";
        msgDiv.innerHTML = `<b>Vous:</b> ${input.value}`;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        
        input.value = "";
    };

    // --- Envoyer Document ---
    window.envoyerDoc = () => {
        if(!selectedProf) {
            alert("Sélectionner un professeur d'abord");
            return;
        }
        
        const fileInput = document.getElementById("uploadDoc");
        if(fileInput.files.length === 0) {
            alert("Choisir un fichier");
            return;
        }
        
        const file = fileInput.files[0];
        let docs = JSON.parse(localStorage.getItem("docs") || "[]");
        
        docs.push({
            filename: file.name,
            sender: eleve.username,
            receiver: selectedProf,
            timestamp: new Date().getTime()
        });
        
        localStorage.setItem("docs", JSON.stringify(docs));
        fileInput.value = "";
        alert("Document envoyé");
    };

    // --- Afficher les documents échangés ---
    function afficherDocs() {
        if(!selectedProf) {
            document.getElementById("listeDocs").innerHTML = "";
            return;
        }
        
        const docs = JSON.parse(localStorage.getItem("docs") || "[]")
            .filter(d => d.receiver === selectedProf)
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        
        const liste = document.getElementById("listeDocs");
        liste.innerHTML = "";
        
        docs.forEach(d => {
            const li = document.createElement("li");
            li.textContent = `${d.sender}: ${d.filename}`;
            liste.appendChild(li);
        });
    }
    setInterval(afficherDocs, 2000);

    // --- Déconnexion ---
    window.logout = () => {
        if(visioActive) stopVisio();
        localStorage.removeItem("eleveConnecte");
        window.location.href = "/login_eleve.html";
    };

    // --- Initialisation ---
    afficherProfs();
}