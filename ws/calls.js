// =======================================================
// WS.CALLS.JS – Gestion des appel
// Séparation des responsabilités
// =======================================================
import { safeSend, broadcastOnlineProfs } from "./utils.js";
import { handleStartSession } from "./visio.js";
import { pool } from "../config/db.js";
import * as onlineProfessorsModule from "./state/onlineProfessors.js";
import { processSessionPayment } from "../services/payment.service.js";
import { closeRoom } from "./rooms.js"; // 🟢 AJOUT import en haut du fichier

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
   // 🔒 Vérification du moyen de paiement — relecture DB (valeur fraîche)
const { rows } = await pool.query(
  `SELECT has_payment_method FROM users WHERE id = $1`,
  [eleveId]
);
const hasPaymentMethod = rows[0]?.has_payment_method ?? false;
if (!hasPaymentMethod) {
  return safeSend(ws, {
    type: "error",
    code: "NO_PAYMENT_METHOD",
    message: "⚠️ Aucun moyen de paiement enregistré. Veuillez ajouter une carte bancaire avant d'appeler un professeur."
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

 if (prof.status !== "disponible") {
  const reason = {
    "en_session":  "Ce professeur est déjà en session",
    "appel_reçu":  "Ce professeur est déjà sollicité",
    "offline":     "Ce professeur est hors ligne",
  }[prof.status] || "Ce professeur est indisponible";
 
  return safeSend(ws, {
    type:    "error",
    code:    "PROF_UNAVAILABLE",
    message: reason,
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
export async function acceptCall(ws, onlineProfessors, clients) { // 🌟 Ajout de "async" ici
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
  let eleveWs = clients.get(eleveId);
  const roomId = `room_${profId}_${eleveId}`;

  // 🌟 CORRECTION : polling au lieu d'une attente unique.
  // Une vraie reconnexion réseau (TCP + TLS + WS upgrade + JWT + identify)
  // peut facilement dépasser 1.2s sur Render, surtout si le client a eu
  // une vraie coupure (pas juste un aller-retour local comme en dev).
  // On vérifie toutes les 500ms, jusqu'à 6 secondes au total.
  if (!eleveWs || eleveWs.readyState !== 1) {
    console.log(`🔍 Élève ${eleveId} instable ou indisponible immédiatement. Attente d'une reconnexion active...`);

    const maxAttempts = 12; // 12 x 500ms = 6s au total
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      eleveWs = clients.get(eleveId);

      if (eleveWs && eleveWs.readyState === 1) {
        console.log(`✅ Élève ${eleveId} reconnecté après ${attempt * 500}ms`);
        break;
      }
    }
  }

  // ⚠️ IMPORTANT : ce check est un NOUVEAU `if`, séparé du précédent.
  // Il ne s'exécute QUE si, après la boucle de polling (ou sans même
  // être entré dedans), la connexion élève n'est toujours pas valide.
  // C'est ce qui manquait : avant, le nettoyage/échec s'exécutait
  // systématiquement après la boucle, même en cas de reconnexion réussie.
  if (!eleveWs || eleveWs.readyState !== 1) {
    console.log(`🔍 DIAGNOSTIC acceptCall final : Échec reconnexion élève ${eleveId}`);

    // 🗑️ NETTOYAGE DB ANTI-BLOCAGE : L'élève a crashé, on libère le canal en DB
    try {
      await pool.query(`DELETE FROM rooms WHERE room_name = $1`, [roomId]);
      console.log(`🗑️ DB Room nettoyée (Élève injoignable) : ${roomId}`);
    } catch (dbErr) {
      console.error("❌ Erreur lors du nettoyage de la room en DB (échec reconnexion):", dbErr.message);
    }

    // Réinitialiser le statut du prof pour qu'il redevienne disponible
    const prof = onlineProfessors.get(profId);
    if (prof) prof.status = "disponible";
    pendingCalls.delete(profId);
    broadcastOnlineProfs(onlineProfessors, clients);

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

  if (prof.sessionStartedAt || prof.status === "en_session") {
    return safeSend(ws, {
      type: "error",
      message: "Vous êtes déjà en session",
      code: "PROF_UNAVAILABLE"
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
export async function rejectCall(ws, onlineProfessors, clients) {
  if (ws.role !== "prof") return;

  const profId = ws.userId;
  const pendingCall = pendingCalls.get(profId);

  if (!pendingCall) return;

  const { eleveId } = pendingCall;
  const eleveWs = clients.get(eleveId);
  const roomId = `room_${profId}_${eleveId}`;

  // Notifier l'élève
  if (eleveWs?.readyState === 1) {
    safeSend(eleveWs, {
      type: "callRejected",
      profId,
      timestamp: new Date().toISOString()
    });
  }

  // 🗑️ NETTOYAGE DB ANTI-BLOCAGE
  try {
    await pool.query(`DELETE FROM rooms WHERE room_name = $1`, [roomId]);
    console.log(`🗑️ DB Room nettoyée (Appel rejeté par le prof) : ${roomId}`);
  } catch (dbErr) {
    console.error("❌ Erreur lors du nettoyage de la room en DB (rejet):", dbErr.message);
  }

  // Rétablir le statut du prof
  const prof = onlineProfessors.get(profId);
  if (prof) prof.status = "disponible";

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
// Ajoutez cet import tout en haut du fichier ws.calls.js :
// import { processSessionPayment } from "../services/payment.service.js";

export async function endSessionForDisconnect(profId, eleveId, onlineProfessors, clients) {

  // ✅ GARDE ANTI-DOUBLE
  const prof = onlineProfessors.get(profId);
  if (!prof || !prof.eleveId) {
    console.log(`⚠️ endSessionForDisconnect ignoré : session déjà terminée pour prof ${profId}`);
    return;
  }
// ✅ SNAPSHOT AVANT endSession() qui remet tout à null
  const sessionStartedAt = prof.sessionStartedAt 
    ? new Date(prof.sessionStartedAt) 
    : new Date(Date.now() - 60000); // fallback 1 min minimum
  onlineProfessorsModule.endSession(profId);

  const profWs  = clients.get(profId);
  const eleveWs = clients.get(eleveId);
  const roomId  = `room_${profId}_${eleveId}`;

  // ✅ CALCUL DURÉE depuis sessionStartedAt du prof
  
  const durationSeconds = Math.floor((Date.now() - sessionStartedAt) / 1000);

  console.log(`⏱️ Durée calculée: ${durationSeconds}s pour ${roomId}`);

  // ✅ INSERTION EN DB si durée suffisante
  if (durationSeconds >= 5) {
    try {
      const { pool } = await import("../config/db.js");
      await pool.query(
        `INSERT INTO visio_sessions
         (user_id, professor_id, room_id, start_time, end_time, duration_seconds, payment_status)
         VALUES ($1, $2, $3, $4, NOW(), $5, 'pending')
         ON CONFLICT DO NOTHING`,
        [eleveId, profId, roomId, sessionStartedAt, durationSeconds]
      );
      console.log(`✅ visio_session insérée: ${durationSeconds}s`);
    } catch (err) {
      console.error(`❌ Erreur insertion visio_session:`, err.message);
    }
  }

  // 💰 PAIEMENT
  try {
    const paymentResult = await processSessionPayment(roomId);

    if (paymentResult && paymentResult.status !== 'requires_action' && paymentResult.status !== 'skipped') {
      const invoicePayload = {
        type: "invoice:ready",
        url: paymentResult.url || `/dashboard/invoices`,
        dureeMinutes: paymentResult.duration || Math.ceil(durationSeconds / 60),
        montant: paymentResult.amount ? (paymentResult.amount / 100).toFixed(2) : "N/A"
      };

      if (eleveWs?.readyState === 1) safeSend(eleveWs, invoicePayload);
      if (profWs?.readyState === 1)  safeSend(profWs,  invoicePayload);

      const { db } = await import("../config/index.js");
      await db.query(
        `INSERT INTO notifications (user_id, type, data, created_at) 
         VALUES (:profId, 'invoice', :data, NOW())`,
        { replacements: { profId, data: JSON.stringify(invoicePayload) } }
      );
    }
  } catch (err) {
    console.error(`❌ Erreur paiement pour ${roomId}:`, err.message);
  }

  // ✅ Notifier fin de session
  const payload = {
    type: "session:stop",
    reason: "session_ended",
    timestamp: new Date().toISOString()
  };

  if (profWs?.readyState === 1)  safeSend(profWs,  payload);
  if (eleveWs?.readyState === 1) safeSend(eleveWs, payload);

  // 🟢 AJOUT : libère la room pour permettre un futur rappel (notify:false car déjà notifié ci-dessus)
  closeRoom(roomId, { notify: false });

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
