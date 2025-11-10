import { WebSocketServer } from "ws";

let clients = new Map(); // { username: { ws, role } }
let connectedProfs = new Map(); // { username: { ws, disponible, salleAttente } }
let connectedEleves = new Map(); // { username: ws }

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws) => {
    let currentUsername = null;
    let currentRole = null;

    console.log("✅ Nouvelle connexion WebSocket");

    ws.on("message", (msg) => {
      try {
        const data = JSON.parse(msg);
        console.log("📨 Message reçu:", data.type, "de:", data.sender || data.username);

        // --- ENREGISTREMENT UTILISATEUR ---
        if (data.type === "register") {
          currentUsername = data.username;
          currentRole = data.role || "eleve";
          
          clients.set(data.username, { ws, role: currentRole });

          if (currentRole === "prof") {
            connectedProfs.set(data.username, {
              ws,
              disponible: true,
              salleAttente: [],
              specialites: data.specialites || []
            });
            console.log(`✅ Prof ${data.username} connecté (Total: ${connectedProfs.size})`);
            broadcastProfList();
          } else {
            connectedEleves.set(data.username, ws);
            console.log(`✅ Élève ${data.username} connecté (Total: ${connectedEleves.size})`);
          }
          return;
        }

        // --- RELAI WEBRTC: OFFER ---
        if (data.type === "offer") {
          if (data.target && clients.has(data.target)) {
            const targetClient = clients.get(data.target);
            if (targetClient.ws.readyState === 1) {
              targetClient.ws.send(JSON.stringify(data));
              console.log(`✉️ Offer relayé vers ${data.target}`);
            }
          } else {
            console.log(`⚠️ Cible ${data.target} introuvable pour offer`);
          }
          return;
        }

        // --- RELAI WEBRTC: ANSWER ---
        if (data.type === "answer") {
          if (data.target && clients.has(data.target)) {
            const targetClient = clients.get(data.target);
            if (targetClient.ws.readyState === 1) {
              targetClient.ws.send(JSON.stringify(data));
              console.log(`✉️ Answer relayé vers ${data.target}`);
            }
          }
          return;
        }

        // --- RELAI WEBRTC: ICE CANDIDATES ---
        if (data.type === "ice") {
          if (data.target && clients.has(data.target)) {
            const targetClient = clients.get(data.target);
            if (targetClient.ws.readyState === 1) {
              targetClient.ws.send(JSON.stringify(data));
            }
          }
          return;
        }

        // --- CHAT ---
        if (data.type === "chat") {
          if (data.target && clients.has(data.target)) {
            const targetClient = clients.get(data.target);
            if (targetClient.ws.readyState === 1) {
              targetClient.ws.send(JSON.stringify(data));
              console.log(`💬 Message chat relayé vers ${data.target}`);
            }
          }
          return;
        }

        // --- REJOINDRE SALLE D'ATTENTE ---
        if (data.type === "joinWaitingRoom") {
          const prof = connectedProfs.get(data.target);
          if (prof) {
            if (!prof.salleAttente.includes(data.sender)) {
              prof.salleAttente.push(data.sender);
              console.log(`⏳ ${data.sender} a rejoint la salle d'attente de ${data.target}`);
              
              // Notifier le prof
              if (prof.ws.readyState === 1) {
                prof.ws.send(JSON.stringify({
                  type: "waitingRoomUpdate",
                  waitingRoom: prof.salleAttente,
                  profName: data.target
                }));
              }
            }
            broadcastProfList();
          } else {
            console.log(`⚠️ Prof ${data.target} non trouvé pour salle d'attente`);
          }
          return;
        }

        // --- QUITTER SALLE D'ATTENTE ---
        if (data.type === "leaveWaitingRoom") {
          const prof = connectedProfs.get(data.target);
          if (prof) {
            prof.salleAttente = prof.salleAttente.filter(e => e !== data.sender);
            console.log(`❌ ${data.sender} a quitté la salle d'attente de ${data.target}`);
            
            if (prof.ws.readyState === 1) {
              prof.ws.send(JSON.stringify({
                type: "waitingRoomUpdate",
                waitingRoom: prof.salleAttente,
                profName: data.target
              }));
            }
            broadcastProfList();
          }
          return;
        }

        // --- ACCEPTER VISIO (supprime de la salle d'attente) ---
        if (data.type === "acceptVisio") {
          const prof = connectedProfs.get(currentUsername);
          if (prof && data.eleveAccepted) {
            prof.salleAttente = prof.salleAttente.filter(e => e !== data.eleveAccepted);
            console.log(`✅ ${data.eleveAccepted} accepté par ${currentUsername}`);
            
            // Notifier le prof
            if (prof.ws.readyState === 1) {
              prof.ws.send(JSON.stringify({
                type: "waitingRoomUpdate",
                waitingRoom: prof.salleAttente
              }));
            }
            broadcastProfList();
          }
          return;
        }

        // --- CHANGEMENT DE DISPONIBILITÉ PROF ---
        if (data.type === "toggleAvailability") {
          const prof = connectedProfs.get(currentUsername);
          if (prof) {
            prof.disponible = !prof.disponible;
            console.log(`🔄 Prof ${currentUsername} disponible: ${prof.disponible}`);
            broadcastProfList();
          }
          return;
        }

        // --- DEMANDER LISTE DES PROFS ---
        if (data.type === "getProfList") {
          const profList = getProfList();
          ws.send(JSON.stringify({
            type: "profList",
            profs: profList
          }));
          console.log(`📡 Liste des profs envoyée à ${currentUsername}`);
          return;
        }

      } catch (error) {
        console.error("❌ Erreur traitement message:", error);
        ws.send(JSON.stringify({ type: "error", message: "Erreur serveur" }));
      }
    });

    ws.on("close", () => {
      if (currentUsername) {
        clients.delete(currentUsername);

        if (currentRole === "prof") {
          connectedProfs.delete(currentUsername);
          console.log(`❌ Prof ${currentUsername} déconnecté (Total: ${connectedProfs.size})`);
          broadcastProfList();
        } else {
          connectedEleves.delete(currentUsername);
          console.log(`❌ Élève ${currentUsername} déconnecté (Total: ${connectedEleves.size})`);
        }
      }
    });

    ws.on("error", (error) => {
      console.error("❌ Erreur WebSocket:", error);
    });
  });

  console.log("🔌 WebSocket serveur initialisé");
}

// --- BROADCAST LISTE DES PROFS À TOUS LES CLIENTS ---
function broadcastProfList() {
  const profList = getProfList();

  const message = JSON.stringify({
    type: "profList",
    profs: profList
  });

  // Envoyer à tous les clients
  for (let client of clients.values()) {
    if (client.ws.readyState === 1) {
      client.ws.send(message);
    }
  }

  console.log(`📡 Liste des profs envoyée (${profList.length} profs connectés)`);
}

// --- OBTENIR LA LISTE DES PROFS ---
export function getProfList() {
  const profList = [];
  for (let [username, prof] of connectedProfs.entries()) {
    profList.push({
      username,
      disponible: prof.disponible,
      salleAttente: prof.salleAttente,
      specialites: prof.specialites
    });
  }
  return profList;
}

// --- EXPORTER POUR UTILISATION DANS SERVER.JS ---
export function getConnectedProfs() {
  return connectedProfs;
}

export function getConnectedEleves() {
  return connectedEleves;
}

export function getClients() {
  return clients;
}

export function disconnectUser(username) {
  const client = clients.get(username);
  if (client && client.ws.readyState === 1) {
    client.ws.close();
  }
}