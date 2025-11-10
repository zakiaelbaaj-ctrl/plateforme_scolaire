// --- Auth Professeur ---
function loginProf() {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;
    if(!username || !password) return alert("Remplir tous les champs");

    const profs = JSON.parse(localStorage.getItem("professeurs") || "[]");
    let prof = profs.find(p => p.username === username && p.password === password);
    if(!prof) { 
        alert("Professeur inconnu"); 
        return; 
    }
    localStorage.setItem("dernier_connecte", JSON.stringify(prof));
    window.location.href = "/prof_dashboard.html";
}

// --- Dashboard Professeur ---
if(window.location.pathname.endsWith("prof_dashboard.html")) {
    let prof = JSON.parse(localStorage.getItem("dernier_connecte"));
    if(!prof) window.location.href = "/login_prof.html";

    const ws = new WebSocket("ws://localhost:3000");
    ws.onopen = () => ws.send(JSON.stringify({type: 'register', username: prof.username}));

    ws.onerror = (error) => {
        console.error("Erreur WebSocket:", error);
        document.getElementById("visioStatus").textContent = "Erreur de connexion";
    };

    const chatBox = document.getElementById("chatBox");
    const localVideo = document.getElementById("localVideo");
    const remoteVideo = document.getElementById("remoteVideo");
    const chatInput = document.getElementById("chatInput");
    
    let pc = null;
    let eleveConnecte = null;
    let visioActif = true;
    let visioActive = false;

    // --- Afficher la salle d'attente ---
    const salleUL = document.getElementById("salle-attente");
    function afficherSalleAttente() {
        salleUL.innerHTML = "";
        
        let profs = JSON.parse(localStorage.getItem("professeurs") || "[]");
        const profActuel = profs.find(p => p.username === prof.username);
        
        if(!profActuel || !profActuel.salleAttente || profActuel.salleAttente.length === 0) {
            const li = document.createElement("li");
            li.textContent = "Aucun élève en attente.";
            salleUL.appendChild(li);
            return;
        }
        
        profActuel.salleAttente.forEach((eleveNom, index) => {
            const li = document.createElement("li");
            li.textContent = eleveNom;
            
            const btn = document.createElement("button");
            btn.textContent = "Accepter Visio";
            btn.onclick = () => accepterVisio(eleveNom, index, profActuel, profs);
            
            li.appendChild(btn);
            salleUL.appendChild(li);
        });
    }
    setInterval(afficherSalleAttente, 1000);

    // --- Accepter la visio d'un élève ---
    async function accepterVisio(eleveNom, index, profActuel, profs) {
        try {
            eleveConnecte = eleveNom;
            document.getElementById("eleveConnecte").innerHTML = `<span style="color: #28a745;">Élève: ${eleveNom}</span>`;
            document.getElementById("visioStatus").textContent = "Initialisation WebRTC...";
            
            pc = new RTCPeerConnection({
                iceServers: [{urls: ['stun:stun.l.google.com:19302']}]
            });
            
            const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
            localVideo.srcObject = stream;
            stream.getTracks().forEach(track => pc.addTrack(track, stream));
            
            pc.ontrack = e => {
                remoteVideo.srcObject = e.streams[0];
            };
            
            pc.onicecandidate = e => {
                if(e.candidate) {
                    ws.send(JSON.stringify({
                        type: 'ice',
                        candidate: e.candidate,
                        target: eleveNom,
                        sender: prof.username
                    }));
                }
            };
            
            // Créer l'offre
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            ws.send(JSON.stringify({
                type: 'offer',
                offer,
                target: eleveNom,
                sender: prof.username
            }));
            
            // Retirer de la salle d'attente
            profActuel.salleAttente.splice(index, 1);
            profs[profs.findIndex(p => p.username === prof.username)] = profActuel;
            localStorage.setItem("professeurs", JSON.stringify(profs));
            
            visioActive = true;
            document.getElementById("visioStatus").textContent = "Visio initiée...";
            document.getElementById("btnToggleVisio").disabled = false;
            document.getElementById("btnTerminerVisio").disabled = false;
            document.getElementById("chatInput").disabled = false;
            document.getElementById("btnSendChat").disabled = false;
            document.getElementById("videoContainer").style.display = "block";
            
            afficherSalleAttente();
        } catch(error) {
            console.error("Erreur acceptation visio:", error);
            document.getElementById("visioStatus").textContent = "Erreur: " + error.message;
        }
    }

    // --- WebRTC et Chat ---
    ws.onmessage = async msg => {
        const data = JSON.parse(msg.data);
        
        if(data.type === 'offer') {
            try {
                eleveConnecte = data.sender;
                document.getElementById("eleveConnecte").innerHTML = `<span style="color: #28a745;">Élève: ${data.sender}</span>`;
                
                pc = new RTCPeerConnection({
                    iceServers: [{urls: ['stun:stun.l.google.com:19302']}]
                });
                
                const stream = await navigator.mediaDevices.getUserMedia({video: true, audio: true});
                localVideo.srcObject = stream;
                stream.getTracks().forEach(track => pc.addTrack(track, stream));
                
                pc.ontrack = e => {
                    remoteVideo.srcObject = e.streams[0];
                };
                
                pc.onicecandidate = e => {
                    if(e.candidate) {
                        ws.send(JSON.stringify({
                            type: 'ice',
                            candidate: e.candidate,
                            target: data.sender,
                            sender: prof.username
                        }));
                    }
                };
                
                await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
                const answer = await pc.createAnswer();
                await pc.setLocalDescription(answer);
                ws.send(JSON.stringify({
                    type: 'answer',
                    answer,
                    target: data.sender,
                    sender: prof.username
                }));
                
                visioActive = true;
                document.getElementById("videoContainer").style.display = "block";
                document.getElementById("visioStatus").textContent = "Visio en cours...";
                document.getElementById("btnToggleVisio").disabled = false;
                document.getElementById("btnTerminerVisio").disabled = false;
                document.getElementById("chatInput").disabled = false;
                document.getElementById("btnSendChat").disabled = false;
            } catch(error) {
                console.error("Erreur traitement offer:", error);
            }
        } 
        else if(data.type === 'answer') {
            if(pc) {
                try {
                    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
                    document.getElementById("visioStatus").textContent = "Visio en cours...";
                } catch(error) {
                    console.error("Erreur setRemoteDescription:", error);
                }
            }
        }
        else if(data.type === 'ice') {
            if(pc && data.candidate) {
                try {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch(error) {
                    console.error("Erreur ICE:", error);
                }
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

    // --- Toggle visio (désactiver/réactiver) ---
    window.toggleVisio = function() {
        if(!pc || !localVideo.srcObject) return;
        visioActif = !visioActif;
        localVideo.srcObject.getTracks().forEach(track => track.enabled = visioActif);
        if(remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.enabled = visioActif);
        }
        document.getElementById("btnToggleVisio").textContent = visioActif ? "🎥 Désactiver la visio" : "🎥 Réactiver la visio";
    };

    // --- Terminer la visio ---
    window.terminerVisio = function() {
        if(pc) {
            pc.close();
            pc = null;
        }
        if(localVideo.srcObject) {
            localVideo.srcObject.getTracks().forEach(track => track.stop());
            localVideo.srcObject = null;
        }
        remoteVideo.srcObject = null;
        visioActif = true;
        eleveConnecte = null;
        visioActive = false;
        
        document.getElementById("videoContainer").style.display = "none";
        document.getElementById("eleveConnecte").innerHTML = "Aucun élève en conversation";
        document.getElementById("visioStatus").textContent = "Visio terminée";
        document.getElementById("btnToggleVisio").disabled = true;
        document.getElementById("btnTerminerVisio").disabled = true;
        document.getElementById("btnToggleVisio").textContent = "🎥 Désactiver la visio";
        document.getElementById("chatInput").disabled = true;
        document.getElementById("btnSendChat").disabled = true;
        document.getElementById("chatBox").innerHTML = "";
        
        afficherSalleAttente();
    };

    // --- Envoyer Chat ---
    window.envoyerChat = function() {
        const input = document.getElementById("chatInput");
        if(!input.value || !eleveConnecte) return;
        
        ws.send(JSON.stringify({
            type: 'chat',
            message: input.value,
            sender: prof.username,
            target: eleveConnecte
        }));
        
        const msgDiv = document.createElement("div");
        msgDiv.className = "chat-message mine";
        msgDiv.innerHTML = `<b>Vous:</b> ${input.value}`;
        chatBox.appendChild(msgDiv);
        chatBox.scrollTop = chatBox.scrollHeight;
        
        input.value = "";
    };

    // --- Afficher documents ---
    function afficherDocsProf() {
        const docs = JSON.parse(localStorage.getItem("docs") || "[]");
        const liste = document.getElementById("listeDocsProf");
        liste.innerHTML = "";
        
        if(docs.length === 0) {
            const li = document.createElement("li");
            li.textContent = "Aucun document reçu.";
            liste.appendChild(li);
            return;
        }
        
        docs.forEach((doc, index) => {
            const li = document.createElement("li");
            li.innerHTML = `📄 De <b>${doc.sender}</b>: ${doc.filename}`;
            
            const btn = document.createElement("button");
            btn.textContent = "🗑 Supprimer";
            btn.className = "danger";
            btn.onclick = () => {
                docs.splice(index, 1);
                localStorage.setItem("docs", JSON.stringify(docs));
                afficherDocsProf();
            };
            
            li.appendChild(btn);
            liste.appendChild(li);
        });
    }
    setInterval(afficherDocsProf, 2000);

    // --- Déconnexion ---
    window.logout = function() {
        if(visioActive) terminerVisio();
        localStorage.removeItem("dernier_connecte");
        window.location.href = "/login_prof.html";
    };

    // --- Initialisation ---
    afficherSalleAttente();
    afficherDocsProf();
}