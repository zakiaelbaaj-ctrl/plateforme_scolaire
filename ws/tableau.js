// =======================================================
// WS.TABLEAU.JS – Tableau blanc interactif
// Synchronisation temps réel des dessins
// =======================================================

import { broadcastRoom } from "./rooms.js";
import { safeSend } from "./utils.js";
import { pool } from "../config/db.js";
// État du tableau (optionnel - pour persistence)
const tableauStates = new Map(); // roomId -> {strokes: [], timestamp}
 // userId -> timestamp
// =======================================================
// RATE LIMIT STROKES
// =======================================================

const strokeRateLimit = new Map(); // userId -> timestamp
const RATE_LIMIT_MS = 0; 
const MAX_STROKES = 5000;
// =======================================================
// TABLEAU STROKE (DESSIN) – VERSION OPTIMISÉE
// =======================================================
export function tableauStroke(ws, payload) {
  console.log("📥 DATA REÇU PAR BACKEND :", payload);

  const { roomId, stroke } = payload;

  const access = validateRoomAccess(ws, roomId);
if (!access.valid) {
  return safeSend(ws, {
    type: "error",
    message: access.message
  });
}

if (!stroke) {
  return safeSend(ws, {
    type: "error",
    message: "stroke requis"
  });
}
  // 🔒 Anti-flood local (~25 strokes/sec)
  // ✅ Validation

  if (!validateStroke(stroke)) {
  return safeSend(ws, {
    type: "error",
    message: "Stroke invalide"
   });
    }
     const now = Date.now();
     const last = strokeRateLimit.get(ws.userId) || 0;
       if (RATE_LIMIT_MS > 0 && now - last < RATE_LIMIT_MS) {
      return; // silence
     }

     strokeRateLimit.set(ws.userId, now);
  // 📊 Garder l'historique
  if (!tableauStates.has(roomId)) {
    tableauStates.set(roomId, { strokes: [], timestamp: new Date().toISOString() });
  }
  const state = tableauStates.get(roomId);

// ✅ AJOUTER ICI
const timestamp = new Date().toISOString();

state.strokes.push({
  ...stroke,
  userId: ws.userId,
  userName: ws.userName,
  timestamp
});

if (state.strokes.length > MAX_STROKES) {
  state.strokes.shift(); // supprime le plus ancien
}
  // 📡 Diffuser à tous les participants
  broadcastRoom(roomId, {
  type: "tableauStroke",
  userId: ws.userId,
  userName: ws.userName,
  stroke,
  timestamp
}, ws); // exclude sender
  console.log(`🎨 Stroke dessiné dans ${roomId} par ${ws.userName}`);
}

// =======================================================
// TABLEAU CLEAR (EFFACER)
// =======================================================
export function tableauClear(ws, { roomId }) {
 const access = validateRoomAccess(ws, roomId);
if (!access.valid) {
  return safeSend(ws, {
    type: "error",
    message: access.message
  });
}

  // 🗑️ Vider l'historique
  if (tableauStates.has(roomId)) {
    tableauStates.delete(roomId);
  }

  // 📡 NOTIFIER TOUS LES PARTICIPANTS
  broadcastRoom(roomId, {
    type: "tableauClear",
    userId: ws.userId,
    userName: ws.userName,
    timestamp: new Date().toISOString()
  });

  console.log(`🗑️ Tableau effacé dans ${roomId} par ${ws.userName}`);
}

// =======================================================
// TABLEAU UNDO (ANNULER)
// =======================================================
export function tableauUndo(ws, { roomId }) {

  const access = validateRoomAccess(ws, roomId);
  if (!access.valid) {
    return safeSend(ws, {
      type: "error",
      message: access.message
    });
  }

  const state = tableauStates.get(roomId);
  if (!state || state.strokes.length === 0) {
    return safeSend(ws, {
      type: "error",
      message: "Rien à annuler"
    });
  }

  // ❌ SUPPRIMER LE DERNIER STROKE
  const removed = state.strokes.pop();

  // 📡 NOTIFIER TOUS LES PARTICIPANTS
  broadcastRoom(roomId, {
    type: "tableauUndo",
    userId: ws.userId,
    userName: ws.userName,
    timestamp: new Date().toISOString()
  });

  console.log(`↩️ Undo dans ${roomId} par ${ws.userName}`);
}

// =======================================================
// TABLEAU EXPORT (EXPORTER EN IMAGE)
// =======================================================
export function tableauExport(ws, { roomId, imageData }) {
  const access = validateRoomAccess(ws, roomId);
if (!access.valid) {
  return safeSend(ws, {
    type: "error",
    message: access.message
  });
}
  // 📤 SAUVEGARDER L'IMAGE (optionnel - en DB ou cloud)
  console.log(`💾 Tableau exporté depuis ${roomId} (${imageData.length} bytes)`);

  // 📡 NOTIFIER LES PARTICIPANTS (optionnel)
  broadcastRoom(roomId, {
    type: "tableauExported",
    userId: ws.userId,
    userName: ws.userName,
    imageSize: imageData.length,
    timestamp: new Date().toISOString()
  });

  // ✅ CONFIRMER À L'UTILISATEUR
  safeSend(ws, {
    type: "tableauExportSuccess",
    message: "Tableau exporté avec succès",
    timestamp: new Date().toISOString()
  });

  console.log(`✅ Export confirmé pour ${ws.userId}`);
}
// =======================================================
// TABLEAU SYNC (SYNCHRONISER NOUVEAU PARTICIPANT)
// =======================================================
 export function tableauSync(ws, { roomId }) {
  const activeRoomId = ws.roomId || ws.studentRoomId;
  // 🔒 Protection stricte : joinRoom doit être fait avant
  if (!activeRoomId || activeRoomId !== roomId) {
    console.log(
      `⛔ tableauSync ignoré: user ${ws.userId} pas encore dans room`
    );
    return; // on ignore silencieusement
  }

  const state = tableauStates.get(roomId);

  safeSend(ws, {
    type: "tableauSync",
    roomId,
    strokes: state ? state.strokes : [],
    timestamp: new Date().toISOString()
  });

  console.log(`🔄 Sync tableau pour ${ws.userId} dans ${roomId}`);
}
// =======================================================
// PARTAGE D'ÉCRAN - INITIER
// =======================================================
export function screenShareStart(ws, { roomId, streamId }) {
 // 1️⃣ Vérification paramètres
if (!roomId || !streamId) {
  return safeSend(ws, {
    type: "error",
    message: "roomId et streamId requis"
  });
}

// 2️⃣ Vérification accès room
const access = validateRoomAccess(ws, roomId);
if (!access.valid) {
  return safeSend(ws, {
    type: "error",
    message: access.message
  });
}

  // 📡 NOTIFIER TOUS LES PARTICIPANTS
  broadcastRoom(roomId, {
    type: "screenShareStarted",
    userId: ws.userId,
    userName: ws.userName,
    streamId,
    timestamp: new Date().toISOString()
  });

  safeSend(ws, {
    type: "screenShareStartSuccess",
    streamId,
    timestamp: new Date().toISOString()
  });

  console.log(`📺 Partage d'écran démarré par ${ws.userName} dans ${roomId}`);
}

// =======================================================
// PARTAGE D'ÉCRAN - ARRÊTER
// =======================================================
export function screenShareStop(ws, { roomId }) {
  const access = validateRoomAccess(ws, roomId);
if (!access.valid) {
  return safeSend(ws, {
    type: "error",
    message: access.message
  });
}

  // 📡 NOTIFIER TOUS LES PARTICIPANTS
  broadcastRoom(roomId, {
    type: "screenShareStopped",
    userId: ws.userId,
    userName: ws.userName,
    timestamp: new Date().toISOString()
  });

  safeSend(ws, {
    type: "screenShareStopSuccess",
    timestamp: new Date().toISOString()
  });

  console.log(`📺 Partage d'écran arrêté par ${ws.userName} dans ${roomId}`);
}
// =======================================================
// TABLEAU TEXT (AJOUT DE TEXTE)
// =======================================================
export function tableauText(ws, payload) {
    const { roomId, textStroke } = payload;

    const access = validateRoomAccess(ws, roomId);
    if (!access.valid || !textStroke) return;

    // Validation simple du texte
    if (typeof textStroke.text !== "string" || textStroke.text.length > 200) return;

    if (!tableauStates.has(roomId)) {
        tableauStates.set(roomId, { strokes: [], timestamp: new Date().toISOString() });
    }
    const state = tableauStates.get(roomId);

    const fullStroke = {
        ...textStroke,
        type: "text", // Différencié du dessin
        userId: ws.userId,
        userName: ws.userName,
        timestamp: new Date().toISOString()
    };

    state.strokes.push(fullStroke);

    // Diffusion à la room
    broadcastRoom(roomId, {
        type: "tableauText",
        ...fullStroke
    }, ws); // exclude sender

    console.log(`📝 Texte ajouté dans ${roomId} par ${ws.userName}`);
}

// =======================================================
// SAUVEGARDE EN BDD (OPTIONNEL MAIS RECOMMANDÉ)
// =======================================================


export async function saveTableauToDB(roomId) {
    const state = tableauStates.get(roomId);
    if (!state || state.strokes.length === 0) return;

    try {
        await pool.query(
            `INSERT INTO whiteboard_sessions (room_id, data, updated_at) 
             VALUES ($1, $2, NOW()) 
             ON CONFLICT (room_id) DO UPDATE SET data = $2, updated_at = NOW()`,
            [roomId, JSON.stringify(state.strokes)]
        );
        console.log(`💾 Backup BDD réussi pour le tableau : ${roomId}`);
    } catch (err) {
        console.error("❌ Erreur sauvegarde tableau BDD:", err.message);
    }
}
// =======================================================
// UTILITAIRES
// =======================================================

function validateRoomAccess(ws, roomId) {
  const activeRoomId = ws.roomId || ws.studentRoomId;
  // 🔒 Si pas encore assigné à une room (joinRoom pas encore fait)
 if (!activeRoomId) {
    return { valid: false, message: "Vous n'êtes dans aucune room active" };
  }

  if (!roomId) {
    return { valid: false, message: "roomId requis" };
  }

 if (activeRoomId !== roomId) {
    return { valid: false, message: "Vous n'êtes pas autorisé dans cette room" };
  }

  return { valid: true };
}
/**
 * Valider un stroke du tableau
 * @param {Object} stroke - {x, y, x0, y0, color, size, type}
 * @returns {boolean}
 */
function validateStroke(stroke) {
  if (!stroke || typeof stroke !== "object") return false;

  const { x, y, type, color, size } = stroke;

  // ✅ x et y doivent être des nombres
  if (typeof x !== "number" || typeof y !== "number") return false;

  // ✅ type doit être "start" ou "move"
  if (type !== "start" && type !== "move") return false;

  // ✅ size doit être un nombre valide
  if (typeof size !== "number" || size < 1 || size > 50) return false;

  // ✅ color doit être une couleur hex valide
  if (typeof color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(color)) return false;

  return true;
}

/**
 * Obtenir l'état du tableau
 */
export function getTableauState(roomId) {
  return tableauStates.get(roomId) || null;
}

/**
 * Nettoyer l'état du tableau lors de la fermeture de room
 */
export function cleanupTableauState(roomId) {
  tableauStates.delete(roomId);
  console.log(`🗑️ État tableau supprimé pour ${roomId}`);
}

/**
 * Obtenir stats du tableau
 */
export function getTableauStats(roomId) {
  const state = tableauStates.get(roomId);
  
  return {
    roomId,
    strokeCount: state ? state.strokes.length : 0,
    createdAt: state ? state.timestamp : null
  };
}