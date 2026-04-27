// =======================================================
// WEBSOCKET SERVER – VERSION FINALE CLEAN
// ✅ updateStatus appelé seulement pour les profs (explicite)
// ✅ Debug logs supprimés
// ✅ Validations ajoutées
// =======================================================
import { MatchService } from "./ws/match.service.js";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import {
  onlineProfessors,
  getOnlineProfessors,
  addProfessor,
  removeProfessor,
  updateStatus
} from "./ws/state/onlineProfessors.js";

import {
  callProfessor,
  acceptCall,
  rejectCall,
  endSessionForDisconnect,
  clearPendingCall
} from "./ws/calls.js";

import {
  joinRoom,
  chatMessage,
  documentShare,
  leaveRoom,
  getRooms
} from "./ws/rooms.js";

import {
  tableauStroke,
  tableauClear,
  tableauUndo,
  tableauExport,
  tableauSync,
  screenShareStart,
  screenShareStop
} from "./ws/tableau.js";

import {
  saveVisioSession,
  handleWebRTCSignal,
  handleCallAccepted,
  handleStartSession,
  updateStatus as updateVisioStatus
} from "./ws/visio.js";

import {
  safeSend,
  broadcastOnlineProfs,
  cleanupOnDisconnect,
  validateMessage,
  RateLimiter
} from "./ws/utils.js";

// =======================================================
// ÉTAT GLOBAL
// =======================================================
const clients = new Map(); // userId → ws
const rateLimiter = new RateLimiter(30, 1000);

// =======================================================
// INIT SERVER
// =======================================================
export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    console.log("🔌 Nouvelle connexion WebSocket");

    // -------------------------
    // 1️⃣ AUTHENTIFICATION JWT
    // -------------------------
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(1008, "Token requis");
      return;
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
      ws.userId = payload.userId;
      ws.role = payload.role === "professeur" ? "prof" : payload.role;
    } catch (err) {
      ws.close(1008, "Token invalide");
      return;
    }

    console.log(`✅ Authentification réussie: ${ws.userId} (${ws.role})`);
   // 🔒 Empêcher double connexion pour le même user
if (clients.has(ws.userId)) {
  console.log(`⚠️ Ancienne connexion détectée pour ${ws.userId}, fermeture...`);
  try {
    const oldWs = clients.get(ws.userId);
    oldWs.terminate(); // plus sûr que close()
  } catch {}
  clients.delete(ws.userId);
}
    // -------------------------
    // 2️⃣ INIT WS STATE
    // -------------------------
    ws.roomId = null;
    ws.status = "idle";
    ws.prenom = null;
    ws.nom = null;
    ws.ville = null;
    ws.pays = null;
    ws.lastActiveAt = new Date().toISOString();
    ws.isAlive = true; // ✅ CORRECTION 2 — isAlive initialisé

    clients.set(ws.userId, ws);

    // -------------------------
    // 3️⃣ EVENTS
    // -------------------------
    ws.on("pong", () => (ws.isAlive = true));

    // ✅ CORRECTION 3 — utiliser onMessage (avec logs + validateMessage)
    ws.on("message", raw => onMessage(ws, raw));

    // ✅ CORRECTION 1 — appelle handleDisconnect (correctement nommée en bas)
    ws.on("close", () => handleDisconnect(ws));
    ws.on("error", err => console.error("❌ Erreur WS:", err));
  }); // ← ferme wss.on("connection")

  // =======================
  // PING / PONG (Keep-Alive)
  // =======================
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log("✅ WebSocket Server prêt");
} // ← ferme initWebSocketServer

// =======================================================
// MESSAGE ROUTER
// =======================================================
async function onMessage(ws, raw) {
  let data;

  try {
    data = JSON.parse(raw.toString());
  } catch (err) {
    console.error("❌ JSON invalide:", err);
    return safeSend(ws, {
      type: "error",
      message: "JSON invalide"
    });
  }

  // Tracker activité
  ws.lastActiveAt = new Date().toISOString();
  console.log(`📩 WS message de ${ws.userId}:`, data.type);

  // Validation basique
  const { valid, error } = validateMessage(data);
  if (!valid) {
    return safeSend(ws, { type: "error", message: error });
  }

  try {
    await handleMessage(ws, data);
  } catch (err) {
    console.error("❌ Erreur message handler:", err.message);
    safeSend(ws, {
      type: "error",
      message: "Erreur serveur interne"
    });
  }
}

// =======================================================
// HANDLERS
// =======================================================
async function handleMessage(ws, data) {
  const { type } = data;

  // Identify
  if (type === "identify") return handleIdentify(ws, data);
   if (type === "onlineProfessors") {
  if (ws.role === "prof") {
    return safeSend(ws, {
      type: "error",
      message: "Les professeurs ne peuvent pas demander cette liste."
    });
  }

  console.log(`📡 Demande liste profs par ${ws.userId}`);

  return safeSend(ws, {
    type: "onlineProfessors",
    profs: getOnlineProfessors(),
    timestamp: new Date().toISOString()
  });
}
  // Rooms
  if (type === "joinRoom") {
  // Stocker paymentIntentId et startTime sur le WebSocket de l'élève
  if (ws.role === "eleve" && data.paymentIntentId) {
    ws.paymentIntentId = data.paymentIntentId;
    ws.sessionStartTime = Date.now();
  }
  return joinRoom(ws, data, onlineProfessors, clients);
}
  if (type === "chatMessage") return chatMessage(ws, data);
  if (type === "document") return documentShare(ws, data);

  // 🎨 TABLEAU BLANC (sécurisé : joinRoom obligatoire)
if (
  type === "tableauStroke" ||
  type === "tableauClear" ||
  type === "tableauUndo" ||
  type === "tableauExport" ||
  type === "tableauSync"
) {
  if (!ws.roomId) {
    console.log(
      `⛔ ${type} ignoré: user ${ws.userId} pas encore dans une room`
    );
    return; // ignore silencieusement
  }

  if (type === "tableauStroke") return tableauStroke(ws, data);
  if (type === "tableauClear") return tableauClear(ws, data);
  if (type === "tableauUndo") return tableauUndo(ws, data);
  if (type === "tableauExport") return tableauExport(ws, data);
  if (type === "tableauSync") return tableauSync(ws, data);
}
  // 📺 PARTAGE D'ÉCRAN (sécurisé : joinRoom obligatoire)
if (type === "screenShareStart" || type === "screenShareStop") {
  if (!ws.roomId) {
    console.log(
      `⛔ ${type} ignoré: user ${ws.userId} pas encore dans une room`
    );
    return;
  }

  if (type === "screenShareStart") return screenShareStart(ws, data);
  if (type === "screenShareStop") return screenShareStop(ws, data);
}
  // ------------------------------------------------------
  // 📞 APPELER UN PROFESSEUR (avec règles métier)
  // ------------------------------------------------------
  if (type === "callProfessor") {
    if (!data.profId) {
      return safeSend(ws, {
        type: "error",
        message: "profId manquant"
      });
    }

    if (ws.role === "prof") {
      return safeSend(ws, {
        type: "error",
        message: "Un professeur ne peut pas appeler un autre professeur."
      });
    }

    if (ws.role === "admin") {
      return safeSend(ws, {
        type: "error",
        message: "Les administrateurs ne peuvent pas appeler un professeur."
      });
    }

    if (ws.role === "etudiant" || ws.role === "eleve") {
      console.log(`📞 Appel: ${ws.role} ${ws.userId} → prof ${data.profId}`);
      return callProfessor(ws, data, onlineProfessors, clients);
    }

    return safeSend(ws, {
      type: "error",
      message: "Vous n'êtes pas autorisé à appeler un professeur."
    });
  }

  if (type === "acceptCall") {
    if (!data.eleveId) {
      return safeSend(ws, {
        type: "error",
        message: "eleveId manquant"
      });
    }

    console.log(`📞 Acceptation: prof ${ws.userId} ← élève ${data.eleveId}`);
    return acceptCall(ws, onlineProfessors, clients);
  }

  if (type === "rejectCall") {
    if (!data.eleveId) {
      return safeSend(ws, {
        type: "error",
        message: "eleveId manquant"
      });
    }

    console.log(`📞 Rejet: prof ${ws.userId} ← élève ${data.eleveId}`);
    return rejectCall(ws, onlineProfessors, clients);
  }

  if (type === "cancelCall") {
  return clearPendingCall(ws.userId);
}

// ======================================================
// 🔚 FIN DE SESSION (ACTION VOLONTAIRE : CLIC "TERMINER")
// ======================================================
if (type === "endSession") {
  console.log(`🔍 endSession reçu de ${ws.userId} (${ws.role})`);
  let profId = null;
  let eleveId = null;

  if (ws.role === "prof") {
    
    const prof = onlineProfessors.get(ws.userId);
    console.log(`🔍 prof trouvé:`, prof ? `eleveId=${prof.eleveId}` : "NON TROUVÉ");
    if (prof?.eleveId) {
      profId = ws.userId;
      eleveId = prof.eleveId;
    }
  } else if (ws.role === "eleve" || ws.role === "etudiant") {
    for (const prof of onlineProfessors.values()) {
      if (prof.eleveId === ws.userId) {
        profId = prof.id;
        eleveId = ws.userId;
        break;
      }
    }
  }

  if (profId && eleveId) {
    console.log(`🎯 Bouton "Terminer" reçu pour : room_${profId}_${eleveId}`);
    await endSessionForDisconnect(profId, eleveId, onlineProfessors, clients);
  } else {
    console.log(`⚠️ Aucun binôme actif pour ${ws.userId}`);
    // ✅ Notifier quand même l'appelant
    safeSend(ws, {
      type: "session:stop",
      reason: "session_ended",
      timestamp: new Date().toISOString()
    });
    leaveRoom(ws);
  }

  broadcastOnlineProfs(onlineProfessors, clients);
  return;
}
// ------------------------------------------------------
// 🎯 MATCHING ÉTUDIANT ↔ ÉTUDIANT
// ------------------------------------------------------
if (type === "requestStudentMatch") {
    const { matiere, sujet, niveau, disponibilite } = data;

    if (!matiere) {
      return safeSend(ws, {
        type: "error",
        message: "La matière est requise"
      });
    }

    if (ws.role === "prof") {
      return safeSend(ws, {
        type: "error",
        message: "Les professeurs ne peuvent pas utiliser le matching."
      });
    }

    if (ws.role === "admin") {
      return safeSend(ws, {
        type: "error",
        message: "Les administrateurs ne peuvent pas utiliser le matching."
      });
    }

    if (ws.role === "etudiant") {
      ws.disponibilite = disponibilite || "now";
      return MatchService.enqueueStudent(ws, matiere, sujet, niveau);
    }

    if (ws.role === "eleve" && ws.niveau === "primaire") {
      return safeSend(ws, {
        type: "error",
        message: "Le matching n'est pas disponible pour les élèves du primaire."
      });
    }

    if (ws.role === "eleve" && ws.niveau === "secondaire") {
      ws.disponibilite = disponibilite || "now";
      return MatchService.enqueueStudent(ws, matiere, sujet, niveau);
    }

    return safeSend(ws, {
      type: "error",
      message: "Vous n'êtes pas autorisé à utiliser le matching."
    });
  }

  // ------------------------------------------------------
  // Visio & WebRTC
  // ------------------------------------------------------
  if (type === "webrtcSignal") {
    return handleWebRTCSignal(ws, data, clients);
  }

  if (type === "visioDuration") {
    return saveVisioSession(ws, data, onlineProfessors);
  }

  if (type === "updateStatus") {
    return updateVisioStatus(ws, data, onlineProfessors);
  }
  if (type === "ping") return safeSend(ws, { type: "pong" });

  console.log("ℹ️ Message inconnu:", type);
}

// =======================================================
// IDENTIFY
// =======================================================
async function handleIdentify(ws, data) {
  console.log("📋 Identify reçu pour:", ws.userId);

  const { prenom, nom, ville, pays, niveau } = data;

  ws.prenom = prenom || "";
  ws.nom = nom || "";
  ws.userName =
  `${ws.prenom || ""} ${ws.nom || ""}`.trim() || ws.userId;
  ws.ville = ville || "";
  ws.pays = pays || "";
  ws.niveau = niveau || null;

  console.log(`🆔 Identify: ${ws.userId} (${ws.role}) → ${ws.prenom} ${ws.nom}`);

  if (ws.role === "prof") {
    addProfessor({
      id: ws.userId,
      prenom: ws.prenom,
      nom: ws.nom,
      ville: ws.ville,
      pays: ws.pays,
      connectedAt: new Date().toISOString(),
      sessionStartedAt: null,
      eleveId: null,
      lastActiveAt: ws.lastActiveAt,
      ws
    });

    console.log(`🎓 Prof enregistré: ${ws.userId} ${ws.prenom} ${ws.nom}`);
broadcastOnlineProfs(onlineProfessors, clients);

// 🔔 Envoyer les notifications en attente
try {
  const { db } = await import("./config/index.js");
  const notifications = await db.query(
    `SELECT * FROM notifications WHERE user_id = :profId AND is_read = false ORDER BY created_at DESC`,
    { replacements: { profId: ws.userId }, type: db.QueryTypes.SELECT }
  );
  for (const notif of notifications) {
    safeSend(ws, notif.data);
    await db.query(
      `UPDATE notifications SET is_read = true WHERE id = :id`,
      { replacements: { id: notif.id } }
    );
  }
} catch (err) {
  console.error("❌ Erreur notifications prof:", err.message);
}
return;
}

  if (ws.role === "eleve" || ws.role === "etudiant") {
    const profs = getOnlineProfessors();
    safeSend(ws, {
      type: "onlineProfessors",
      profs,
      timestamp: new Date().toISOString()
    });

    console.log(`👨‍🎓 ${ws.role === "eleve" ? "Élève" : "Étudiant"} enregistré: ${ws.userId}`);
    return;
  }
}

// =======================================================
// DISCONNECT — ✅ CORRECTION 1 : nommée handleDisconnect
// =======================================================
function handleDisconnect(ws) {
  console.log(`❌ Déconnexion: ${ws.userId} (${ws.role})`);

  if (ws.role === "prof") {
    updateStatus(ws.userId, "offline");

    const prof = onlineProfessors.get(ws.userId);

    // ✅ Sauvegarder eleveId AVANT tout nettoyage
    const eleveIdSnapshot = prof?.eleveId ?? null;

    if (prof && eleveIdSnapshot) {
      console.log(`🔄 Prof ${ws.userId} déconnecté → libère élève ${eleveIdSnapshot}`);
      endSessionForDisconnect(ws.userId, eleveIdSnapshot, onlineProfessors, clients);
    }

    removeProfessor(ws.userId);
    clearPendingCall(ws.userId);
  }

  if (ws.role === "eleve" || ws.role === "etudiant") {
    // 1. On cherche si cet utilisateur (peu importe son rôle) était en cours avec un prof
    for (const prof of onlineProfessors.values()) {
      if (prof.eleveId === ws.userId) {
        console.log(`🔄 Utilisateur ${ws.userId} déconnecté → libère prof ${prof.id}`);
        endSessionForDisconnect(prof.id, ws.userId, onlineProfessors, clients);
      }
    }

    // 2. Si c'est un étudiant, on le retire aussi de la file d'attente du matching
    if (ws.role === "etudiant" && MatchService?.removeStudent) {
      MatchService.removeStudent(ws.userId);
    }
  }

  leaveRoom(ws);
  cleanupOnDisconnect(ws, {
    clients,
    onlineProfessors,
    rooms: getRooms()
  });

  broadcastOnlineProfs(onlineProfessors, clients);
  clients.delete(ws.userId);

  console.log(`✅ Nettoyage complet: ${ws.userId}`);
}

// =======================================================
// EXPORTS
// =======================================================
export { clients, onlineProfessors, safeSend, broadcastOnlineProfs };
