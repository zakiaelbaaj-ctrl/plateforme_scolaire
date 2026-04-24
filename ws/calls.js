// =======================================================
// WS.CALLS.JS – Gestion des appels
// Séparation des responsabilités
// =======================================================
import { safeSend, broadcastOnlineProfs } from "./utils.js";
import { handleStartSession } from "./visio.js";
import { pool } from "../config/db.js";
import * as onlineProfessorsModule from "./state/onlineProfessors.js";
import Stripe from "stripe";
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
export async function endSessionForDisconnect(profId, eleveId, onlineProfessors, clients) {
  onlineProfessorsModule.endSession(profId);

  const profWs  = clients.get(profId);
  const eleveWs = clients.get(eleveId);

  // 💰 Capture paiement + facture
  try {
    const paymentIntentId = eleveWs?.paymentIntentId ?? null;
    const startTime = eleveWs?.sessionStartTime ?? null;

    if (paymentIntentId && startTime) {
      const { db } = await import("../config/index.js");
      const { generateInvoicePdf } = await import("../services/invoicePdf.js");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

      // 1. Récupérer le niveau du prof
      const [prof] = await db.query(
        `SELECT niveau FROM users WHERE id = :profId`,
        { replacements: { profId }, type: db.QueryTypes.SELECT }
      );

      const niveau = prof?.niveau || "secondaire";
      const tarifParMinute = niveau === "universitaire" ? 83 : 33; // centimes

      // 2. Calcul durée et montant
      const dureeMinutes = Math.ceil((Date.now() - startTime) / 60000);
      const montantFinal = Math.max(dureeMinutes * tarifParMinute, tarifParMinute);

      console.log(`💰 Durée: ${dureeMinutes}min | Niveau: ${niveau} | Montant: ${montantFinal/100}€`);

      // 3. Capture Stripe
      if (dureeMinutes === 0) {
        await stripe.paymentIntents.cancel(paymentIntentId);
        console.log("⏳ Session 0 min — empreinte annulée");
      } else {
        await stripe.paymentIntents.update(paymentIntentId, {
          metadata: {
            roomId: `room_${profId}_${eleveId}`,
            eleveId: String(eleveId),
            profId: String(profId),
            duree: String(dureeMinutes)
          }
        });
        await stripe.paymentIntents.capture(paymentIntentId, {
          amount_to_capture: montantFinal
        });
        console.log(`✅ Paiement capturé: ${montantFinal/100}€`);
      }

      // 4. Génération facture PDF
      const invoiceNumber = `VID-${profId}-${eleveId}-${Date.now()}`;
      const { fileName } = await generateInvoicePdf({
        userId: eleveId,
        planType: `Cours vidéo ${niveau} (${dureeMinutes} min)`,
        amount: montantFinal,
        invoiceNumber,
        date: new Date()
      });

      // 5. Envoyer lien facture aux deux
      const invoicePayload = {
        type: "invoice:ready",
        url: `/invoices/${fileName}`,
        dureeMinutes,
        montant: (montantFinal / 100).toFixed(2)
      };
      if (eleveWs?.readyState === 1) safeSend(eleveWs, invoicePayload);
      if (profWs?.readyState === 1)  safeSend(profWs,  invoicePayload);

      console.log(`🧾 Facture générée: ${fileName}`);
    }
  } catch (err) {
    console.error("❌ Erreur capture/facture:", err.message);
  }

  // ✅ Notifier fin de session
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
