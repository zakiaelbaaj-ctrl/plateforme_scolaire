// =======================================================
// WS.CALLS.JS – Gestion des appels
// Séparation des responsabilités
// =======================================================
import { safeSend, broadcastOnlineProfs } from "./utils.js";
import { handleStartSession } from "./visio.js";
import { pool } from "../config/db.js";
import * as onlineProfessorsModule from "./state/onlineProfessors.js";
// État des appels en attente (SERVEUR UNIQUEMENT)
const pendingCalls = new Map();  // profId -> {eleveId, timestamp}

// =======================================================
// APPEL PROFESSEUR (depuis élève)
// =======================================================
export async function callProfessor(ws, { profId }, onlineProfessors, clients) {
  const eleveId = ws.userId;

  if (ws.role !== "eleve" && ws.role !== "etudiant") {
    return safeSend(ws, {
      type: "error",
      message: "Action non autorisée"
    });
  }

  const profIdNum = parseInt(profId, 10);
  if (isNaN(profIdNum)) {
    return safeSend(ws, {
      type: "error",
      message: "ID professeur invalide"
    });
  }

  const prof = onlineProfessors.get(profIdNum);
  if (!prof || !prof.ws || prof.ws.readyState !== 1) {
    return safeSend(ws, {
      type: "error",
      message: "Professeur hors ligne"
    });
  }

  if (prof.sessionStartedAt) {
    return safeSend(ws, {
      type: "error",
      message: "Professeur déjà en session"
    });
  }

  const roomId = `room_${profIdNum}_${eleveId}`;

  // 👉 INSERTION SQL FONCTIONNE MAINTENANT
  try {
  await pool.query(
    `INSERT INTO rooms (room_name, prof_id, eleve_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [roomId, profIdNum, eleveId]
  );
} catch (err) { 
  console.error("❌ Erreur insertion room:", err); 
  return safeSend(ws, { 
    type: "error", 
    message: "Impossible de créer la room" 
  }); 
}
  
// Double appel protection
  if (pendingCalls.has(profIdNum)) {
    const existingCall = pendingCalls.get(profIdNum);
    if (existingCall.eleveId === eleveId) {
      return safeSend(ws, {
        type: "error",
        message: "Appel déjà en attente",
        code: "ALREADY_CALLING"
      });
    }
  }

  // ✅ CRÉER L'APPEL EN ATTENTE
  pendingCalls.set(profIdNum, {
    eleveId,
    eleveName: ws.userName,
    timestamp: new Date().toISOString()
  });

  // Marquer prof comme sollicité
  prof.status = "appel_reçu";
  broadcastOnlineProfs(onlineProfessors, clients);

  // 📲 Notifier le prof
  safeSend(prof.ws, {
    type: "incomingCall",
    eleveId,
    eleveName: ws.userName,
    timestamp: new Date().toISOString()
  });

  // Confirmer à l'élève
  safeSend(ws, {
    type: "callSent",
    profId: profIdNum,
    status: "waiting"
  });

  console.log(`📞 Appel créé: élève ${eleveId} → prof ${profIdNum}`);
}

// =======================================================
// ACCEPTER L'APPEL (depuis prof)
// =======================================================
export function acceptCall(ws, onlineProfessors, clients) {
  console.log("✅ acceptCall appelé avec clients:", typeof clients);
  // 🔒 Sécurité
  if (ws.role !== "prof") {
    return safeSend(ws, {
      type: "error",
      message: "Action non autorisée"
    });
  }

  const profId = ws.userId;
  const pendingCall = pendingCalls.get(profId);

  if (!pendingCall) {
    return safeSend(ws, {
      type: "error",
      message: "Pas d'appel en attente"
    });
  }

  const { eleveId } = pendingCall;
  const eleveWs = clients.get(eleveId);

  // Vérifications
  if (!eleveWs || eleveWs.readyState !== 1) {
    return safeSend(ws, {
      type: "error",
      message: "Élève indisponible"
    });
  }

  const prof = onlineProfessors.get(profId);
  if (!prof) {
    return safeSend(ws, {
      type: "error",
      message: "Prof non trouvé"
    });
  }

  if (prof.sessionStartedAt) {
    return safeSend(ws, {
      type: "error",
      message: "Vous êtes déjà en session"
    });
  }

  // ✅ DÉMARRER LA SESSION (SERVEUR ONLY)
  startSession(profId, eleveId, onlineProfessors, ws, eleveWs, clients);

  // Nettoyer appel en attente
  pendingCalls.delete(profId);

  console.log(`✅ Appel accepté: élève ${eleveId} ← prof ${profId}`);
  broadcastOnlineProfs(onlineProfessors, clients);
}

// =======================================================
// REJETER L'APPEL (depuis prof)
// =======================================================
export function rejectCall(ws, onlineProfessors, clients) {
  if (ws.role !== "prof") return;

  const profId = ws.userId;
  const pendingCall = pendingCalls.get(profId);

  if (!pendingCall) return;

  const { eleveId } = pendingCall;
  const eleveWs = clients.get(eleveId);

  // Notifier l'élève
  if (eleveWs?.readyState === 1) {
    safeSend(eleveWs, {
      type: "callRejected",
      profId,
      timestamp: new Date().toISOString()
    });
  }

  pendingCalls.delete(profId);

  console.log(`❌ Appel rejeté: élève ${eleveId} ← prof ${profId}`);
  broadcastOnlineProfs(onlineProfessors, clients);
}

// =======================================================
// DÉMARRER SESSION (INTERNE SERVEUR UNIQUEMENT)
// 🔒 NE PAS APPELER DEPUIS LE CLIENT
// =======================================================
function startSession(
  profId,
  eleveId,
  onlineProfessors,
  profWs,
  eleveWs,
  clients
) {
  // 🔒 État serveur
  onlineProfessorsModule.startSession(profId, eleveId);

  profWs.status = "en_session";
  eleveWs.status = "en_session";

  const roomId = `room_${profId}_${eleveId}`;

  // 🔥 UNE SEULE SOURCE D'ÉMISSION
  handleStartSession(
    profWs,
    { roomId, studentId: eleveId },
    clients
  );

  console.log(
    `🎬 Session démarrée: room=${roomId} prof=${profId} ↔ eleve=${eleveId}`
  );
}

// =======================================================
// TERMINER SESSION (INTERNE SERVEUR UNIQUEMENT)
// 🔒 NE PAS APPELER DEPUIS LE CLIENT
// =======================================================
export function endSessionForDisconnect(profId, eleveId, onlineProfessors, clients) {
  onlineProfessorsModule.endSession(profId);

  // ✅ Notifier LES DEUX participants
  const profWs  = clients.get(profId);
  const eleveWs = clients.get(eleveId);

  const payload = {
    type: "session:stop",
    reason: "session_ended",
    timestamp: new Date().toISOString()
  };

  if (profWs?.readyState === 1)  safeSend(profWs,  payload);
  if (eleveWs?.readyState === 1) safeSend(eleveWs, payload);

  console.log(`📴 Session terminée: prof ${profId} ↔ élève ${eleveId}`);
}

// =======================================================
// UTILITAIRES
// =======================================================
export function getPendingCalls() {
  return pendingCalls;
}

export function clearPendingCall(profId) {
  pendingCalls.delete(profId);
}

export function getPendingCall(profId) {
  return pendingCalls.get(profId);
}
