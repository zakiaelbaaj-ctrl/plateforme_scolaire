// =======================================================
// WEBSOCKET SERVER – VERSION FINALE VALIDÉE
// =======================================================
import { MatchService } from "./ws/match.service.js";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { pool } from "./config/db.js";
import {
  onlineProfessors,
  getOnlineProfessors,
  removeProfessor,
  addProfessor,
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
  updateStatus as updateVisioStatus
} from "./ws/visio.js";

import {
  safeSend,
  broadcastOnlineProfs,
  broadcastOnlineStudents,
  cleanupOnDisconnect,
  validateMessage,
  RateLimiter
} from "./ws/utils.js";

import { handleStudentMessage, handleStudentDisconnect, cleanupStudentRoom } from "./ws/etudiant/index.js";

const STUDENT_TYPES = new Set([
  "student:enqueue",
  "student:dequeue",
  "student:joinRoom",
  "student:join-room",
  "student:leaveRoom",
  "student:leave-room",
  "student:signal",
  "student:chatMessage",
  "student:documentShare"
]);

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

  wss.on("connection", async (ws, req) => {
    console.log("🔌 Nouvelle connexion WebSocket");

    // 1️⃣ AUTHENTIFICATION JWT
    const url = new URL(req.url, "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      console.log("⛔ Connexion refusée: token manquant");
      ws.close(1008, "Token requis");
      return;
    }
     let payload;
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      ws.userId = payload.userId;
      ws.role = payload.role === "professeur" ? "prof" : payload.role;
    } catch (err) {
      console.log("⛔ Connexion refusée: token invalide -", err.message);
      ws.close(1008, "Token invalide");
      return;
    }

    console.log(`✅ Authentification réussie: ${ws.userId} (${ws.role})`);

    // 2️⃣ INIT WS STATE
    ws.roomId = null;
    ws.studentRoomId = null;
    ws.status = "idle";
    ws.prenom = null;
    ws.nom = null;
    ws.ville = null;
    ws.pays = null;
    ws.photo_identite_url = null;
    ws.lastActiveAt = new Date().toISOString();
    ws.isAlive = true;
    ws.subscriptionStatus = null;
    ws.socketUniqueId = Math.random().toString(36).substring(2, 9) + "-" + Date.now();

    // 3️⃣ GESTION ANCIENNE CONNEXION (ZOMBIE)
    if (clients.has(ws.userId)) {
      console.log(`⚠️ Ancienne connexion détectée pour ${ws.userId}, fermeture...`);
      try {
        const oldWs = clients.get(ws.userId);
        oldWs._isReplacedConnection = true;
        oldWs.terminate();
      } catch (err) {
        console.error("❌ Erreur fermeture ancienne socket:", err.message);
      }
    }

    // Enregistrement de la nouvelle socket officielle
    clients.set(ws.userId, ws);

    // 4️⃣ LISTENERS
    ws.on("pong", () => {
      ws.isAlive = true;
      ws.lastActiveAt = new Date().toISOString();

      if (ws.role === "prof") {
        const prof = onlineProfessors.get(ws.userId);
        if (prof) {
          prof.lastActiveAt = ws.lastActiveAt;
          onlineProfessors.set(ws.userId, prof);
        }
      }
    });

    ws.on("message", raw => onMessage(ws, raw));
    ws.on("close", () => handleDisconnect(ws));
    ws.on("error", err => console.error("❌ Erreur WS:", err));

    // 5️⃣ CHARGEMENT STATUT ABONNEMENT
    if (ws.role === "etudiant" || ws.role === "eleve") {
      try {
        const { rows } = await pool.query(
          `SELECT subscription_status, subscription_end_date, free_trial_end FROM users WHERE id = $1`,
          [ws.userId]
        );
        const user = rows[0];
        if (user) {
          const now = new Date();
          const isSubscriptionExpired =
            user.subscription_end_date && new Date(user.subscription_end_date) < now;
          const isTrialExpired =
            user.subscription_status === "trial" &&
            user.free_trial_end &&
            new Date(user.free_trial_end) < now;

          ws.subscriptionStatus =
            (isSubscriptionExpired || isTrialExpired) ? "expired" : (user.subscription_status || null);
        }
      } catch (err) {
        console.error("❌ Erreur chargement subscriptionStatus:", err.message);
      }
    }
  });

  // Keep-Alive Ping/Pong
  setInterval(() => {
    wss.clients.forEach(ws => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  console.log("✅ WebSocket Server prêt");
}

// =======================================================
// ROUTER DE MESSAGES
// =======================================================
async function onMessage(ws, raw) {
  // Protection anti-spam Rate Limit
  if (!rateLimiter.isAllowed(ws.userId)) {
    return safeSend(ws, { type: "error", message: "Trop de requêtes, veuillez ralentir." });
  }

  let data;
  try {
    data = JSON.parse(raw.toString());
  } catch (err) {
    return safeSend(ws, { type: "error", message: "JSON invalide" });
  }

  ws.lastActiveAt = new Date().toISOString();

  const { valid, error } = validateMessage(data);
  if (!valid) {
    return safeSend(ws, { type: "error", message: error });
  }

  if (STUDENT_TYPES.has(data.type)) {
    if (ws.role === "prof" || ws.role === "admin") {
      return safeSend(ws, { type: "error", message: "Action non autorisée." });
    }
    return handleStudentMessage(ws, data);
  }

  try {
    await handleMessage(ws, data);
  } catch (err) {
    console.error("❌ Erreur message handler:", err.message);
    safeSend(ws, { type: "error", message: "Erreur serveur interne" });
  }
}

// =======================================================
// HANDLERS
// =======================================================
async function handleMessage(ws, data) {
  const { type } = data;

  if (type === "identify") return handleIdentify(ws, data);

  if (type === "onlineProfessors") {
    if (ws.role === "prof") {
      return safeSend(ws, { type: "error", message: "Les professeurs ne peuvent pas demander cette liste." });
    }
    return safeSend(ws, {
      type: "onlineProfessors",
      profs: getOnlineProfessors(),
      timestamp: new Date().toISOString()
    });
  }

  if (type === "joinRoom") {
    if (ws.role === "eleve" && data.paymentIntentId) {
      ws.paymentIntentId = data.paymentIntentId;
      ws.sessionStartTime = Date.now();
    }
    return joinRoom(ws, data, onlineProfessors, clients);
  }

  if (type === "chatMessage") return chatMessage(ws, data);
  if (type === "document") return documentShare(ws, data);

  if (
    type === "tableauStroke" ||
    type === "tableauClear" ||
    type === "tableauUndo" ||
    type === "tableauExport" ||
    type === "tableauSync"
  ) {
    const activeRoomId = ws.roomId || ws.studentRoomId;
    if (!activeRoomId) return;
    data.roomId = activeRoomId;
    if (type === "tableauStroke") return tableauStroke(ws, data);
    if (type === "tableauClear") return tableauClear(ws, data);
    if (type === "tableauUndo") return tableauUndo(ws, data);
    if (type === "tableauExport") return tableauExport(ws, data);
    if (type === "tableauSync") return tableauSync(ws, data);
  }

  if (type === "screenShareStart" || type === "screenShareStop") {
    const activeRoomId = ws.roomId || ws.studentRoomId;
    if (!activeRoomId) return;
    data.roomId = activeRoomId;
    if (type === "screenShareStart") return screenShareStart(ws, data);
    if (type === "screenShareStop") return screenShareStop(ws, data);
  }

  if (type === "callProfessor") {
    if (!data.profId) return safeSend(ws, { type: "error", message: "profId manquant" });
    if (ws.role === "prof" || ws.role === "admin") {
      return safeSend(ws, { type: "error", message: "Action non autorisée." });
    }
    return callProfessor(ws, data, onlineProfessors, clients);
  }

  if (type === "acceptCall") {
    if (!data.eleveId) return safeSend(ws, { type: "error", message: "eleveId manquant" });
    return acceptCall(ws, onlineProfessors, clients);
  }

  if (type === "rejectCall") {
    if (!data.eleveId) return safeSend(ws, { type: "error", message: "eleveId manquant" });
    return rejectCall(ws, onlineProfessors, clients);
  }

  if (type === "cancelCall") return clearPendingCall(ws.userId);

  if (type === "endSession") {
    console.log(`🔍 endSession reçu de ${ws.userId} (${ws.role})`);
    let profId = null;
    let eleveId = null;
    // Extraction via roomId (ex: room_18_32)
  const roomId = data.roomId || ws.roomId;
  if (roomId && roomId.startsWith("room_")) {
    const parts = roomId.split("_");
    if (parts.length >= 3) {
      profId = parseInt(parts[1], 10);
      eleveId = parseInt(parts[2], 10);
    }
  }
  // Fallback si pas de roomId explicite
  if (!profId || !eleveId) {

    if (ws.role === "prof") {
      const prof = onlineProfessors.get(ws.userId);
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
    }
    // 🔴 RESTAURATION CRITIQUE : Appel de la fonction de facturation
    if (profId && eleveId) {
      console.log(`🎯 Fin session: room_${profId}_${eleveId}`);
      await endSessionForDisconnect(profId, eleveId, onlineProfessors, clients);
    } else {
      console.log(`⚠️ Aucun binôme actif pour ${ws.userId}`);
      safeSend(ws, { type: "session:stop", reason: "session_ended", timestamp: new Date().toISOString() });
      leaveRoom(ws);
    }

    broadcastOnlineProfs(onlineProfessors, clients);
    broadcastOnlineStudents(clients);
    return;
  }

  if (type === "requestStudentMatch") {
    const { matiere, sujet, niveau, disponibilite } = data;
    if (!matiere) return safeSend(ws, { type: "error", message: "La matière est requise" });
    if (ws.role === "prof" || ws.role === "admin") {
      return safeSend(ws, { type: "error", message: "Action non autorisée." });
    }
    if (ws.role === "etudiant" || (ws.role === "eleve" && ws.niveau !== "primaire")) {
      ws.disponibilite = disponibilite || "now";
      return MatchService.enqueueStudent(ws, matiere, sujet, niveau);
    }
    return safeSend(ws, { type: "error", message: "Matching indisponible pour votre niveau." });
  }

  if (type === "webrtcSignal") return handleWebRTCSignal(ws, data, clients);
  if (type === "visioDuration") return saveVisioSession(ws, data, onlineProfessors);
  if (type === "updateStatus") return updateVisioStatus(ws, data, onlineProfessors);
  if (type === "ping") return safeSend(ws, { type: "pong" });
}

// =======================================================
// IDENTIFY
// =======================================================
async function handleIdentify(ws, data) {
  const { prenom, nom, ville, pays, niveau, matiere, photo_identite_url } = data;
  ws.prenom = prenom || "";
  ws.nom = nom || "";
  ws.matiere = matiere || null;
  ws.niveau = niveau || null;
  ws.userName = `${ws.prenom} ${ws.nom}`.trim() || String(ws.userId);
  ws.ville = ville || "";
  ws.pays = pays || "";
  ws.photo_identite_url = photo_identite_url || null;
  ws.identified = true;

  // 1️⃣ PROFESSEUR
  if (ws.role === "prof") {
    addProfessor({
      id: ws.userId,
      role: ws.role,
      prenom: ws.prenom,
      nom: ws.nom,
      ville: ws.ville,
      pays: ws.pays,
      matiere: ws.matiere,
      niveau: ws.niveau,
      photo_identite_url: ws.photo_identite_url,
      connectedAt: new Date().toISOString(),
      sessionStartedAt: null,
      eleveId: null,
      lastActiveAt: ws.lastActiveAt,
      ws
    });

    broadcastOnlineProfs(onlineProfessors, clients);

    try {
      const { rows } = await pool.query(
        `SELECT * FROM notifications WHERE user_id = $1 AND is_read = false ORDER BY created_at DESC`,
        [ws.userId]
      );
      for (const notif of rows) {
        const notifPayload = typeof notif.data === "string" ? JSON.parse(notif.data) : notif.data;
        safeSend(ws, notifPayload);
        await pool.query(`UPDATE notifications SET is_read = true WHERE id = $1`, [notif.id]);
      }
    } catch (err) {
      console.error("❌ Erreur notifications prof:", err.message);
    }
    return;
  }

  // 2️⃣ ÉTUDIANT
  if (ws.role === "etudiant") {
    broadcastOnlineStudents(clients);
    return;
  }

  // 3️⃣ ÉLÈVE
  if (ws.role === "eleve") {
    safeSend(ws, {
      type: "onlineProfessors",
      profs: getOnlineProfessors(),
      timestamp: new Date().toISOString()
    });
    return;
  }
}

// =======================================================
// DISCONNECT HANDLER
// =======================================================
async function handleDisconnect(ws) {
  if (ws._isReplacedConnection) return;

  const activeWs = clients.get(ws.userId);
  const isActiveConnection = activeWs && activeWs.socketUniqueId === ws.socketUniqueId;

  if (ws.role === "prof") {
  if (isActiveConnection) {
    updateStatus(ws.userId, "offline");
    const prof = onlineProfessors.get(ws.userId);
    const eleveIdSnapshot = prof?.eleveId ?? null;

    if (prof && eleveIdSnapshot) {
      console.log(`🔄 Prof ${ws.userId} déconnecté → libère élève ${eleveIdSnapshot}`);
      await endSessionForDisconnect(ws.userId, eleveIdSnapshot, onlineProfessors, clients); // ✅ await ajouté
    }
    removeProfessor(ws.userId);
    clearPendingCall(ws.userId);
  } else {
    console.log(`🔕 Déconnexion ignorée (socket zombie) pour prof ${ws.userId} — reconnexion déjà en place`);
     }
     }
      if (ws.role === "eleve" || ws.role === "etudiant") {
  if (isActiveConnection) {
    for (const prof of onlineProfessors.values()) {
      if (prof.eleveId === ws.userId) {
        console.log(`🔄 Utilisateur ${ws.userId} déconnecté → libère prof ${prof.id}`);
        await endSessionForDisconnect(prof.id, ws.userId, onlineProfessors, clients); // ✅ await ajouté
      }
    }

    if (ws.role === "etudiant" && MatchService?.removeStudent) {
      MatchService.removeStudent(ws.userId);
    }
    await handleStudentDisconnect(ws);
  } else {
    console.log(`🔕 Déconnexion ignorée (socket zombie) pour ${ws.role} ${ws.userId} — reconnexion déjà en place`);
    if (ws.role === "etudiant") {
      cleanupStudentRoom(ws);
    }
  }
}
// ✅ 3️⃣ NETTOYAGE SYSTÈME restauré (manquait entièrement)
  if (isActiveConnection) {
    leaveRoom(ws);
  }
  cleanupOnDisconnect(ws, {
    clients,
    onlineProfessors,
    rooms: getRooms()
  });
}
export { clients, onlineProfessors, safeSend, broadcastOnlineProfs };