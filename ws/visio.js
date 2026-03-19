// =======================================================
// WS.VISIO.JS – Gestion des sessions vidéo & facturation
// =======================================================

import { pool } from "../config/db.js";
import { billCall } from "../services/callBilling.service.js";
import { safeSend } from "./utils.js";
import { endSession } from "./state/onlineProfessors.js";

export async function saveVisioSession(ws, { roomId, duration, matiere }, onlineProfessors) {
  // 🔒 Bloquer les appels du prof : seule l'élève déclenche la facturation
  if (ws.role !== "eleve") {
    console.warn("⛔ visioDuration ignoré (non élève)", ws.userId);
    return;
  }

  // Vérification des paramètres requis
  if (!ws.userId || !roomId || duration == null) {
    return safeSend(ws, {
      type: "error",
      message: "Paramètres requis manquants"
    });
  }

  // 🔢 Normaliser la durée
  const durationSec = parseInt(duration, 10);
  if (isNaN(durationSec) || durationSec <= 0) {
    return safeSend(ws, {
      type: "error",
      message: "Durée invalide"
    });
  }

  // ⛔ GARDE-FOU : ignorer les échecs ultra courts (< 5s)
  if (durationSec < 5) {
    console.warn("⛔ Visio ignorée (durée trop courte):", durationSec);
    return safeSend(ws, {
      type: "visioSaved",
      minutes: 0,
      amount: 0,
      paymentStatus: "ignored",
      reason: "too_short"
    });
  }

  console.log(`💾 Sauvegarde session visio: ${ws.userId} dans ${roomId}`);

  try {
    // 1️⃣ Trouver le professeur associé à la room
    const { rows } = await pool.query(
      `SELECT prof_id FROM rooms WHERE room_name = $1`,
      [roomId]
    );

    if (rows.length === 0) {
      throw new Error("Room introuvable");
    }

    const professorId = rows[0].prof_id;

    // ✅ Facturation minimum 30 min = 10 €
    const MINUTES_MINIMUM = 30;
    const AMOUNT_MINIMUM = 10;
    const PRICE_PER_MINUTE = AMOUNT_MINIMUM / MINUTES_MINIMUM; // 0.3333 €/min

    const minutes = Math.ceil(durationSec / 60);
    const billedMinutes = Math.max(minutes, MINUTES_MINIMUM);
    const billedSeconds = billedMinutes * 60;
    const rawAmount = billedMinutes * PRICE_PER_MINUTE;
    const amount = Number(rawAmount.toFixed(2));

    console.log(`💰 Facturation: ${billedMinutes} min → €${amount}`);

    // 3️⃣ Paiement Stripe
    let paymentIntentId = null;
    let paymentStatus = "pending";

    try {
      const intent = await billCall({
        studentId: ws.userId,
        amountEuros: amount,
        description: `Cours ${matiere || "Générique"} – ${minutes} min`,
      });

      paymentIntentId = intent.id;
      paymentStatus = "succeeded";
      console.log("✅ Paiement réussi:", paymentIntentId);
    } catch (stripeErr) {
      console.error("❌ Paiement échoué:", stripeErr.message);
      paymentStatus = "failed";
      // On continue quand même la sauvegarde
    }

    // 4️⃣ Sauvegarde BD
    await pool.query(
      `INSERT INTO visio_sessions
       (user_id, professor_id, room_id, start_time, end_time, duration_seconds, amount, payment_intent_id, payment_status, matiere)
       VALUES (
         $1, $2, $3,
         NOW() - $4 * INTERVAL '1 second',
         NOW(),
         $4, $5, $6, $7, $8
       )`,
      [
        ws.userId,
        professorId,
        roomId,
        billedSeconds,    // durée facturée en secondes
        amount,           // montant NUMERIC
        paymentIntentId,
        paymentStatus,
        matiere || null
      ]
    );

    console.log(`✅ Visio enregistrée: ${billedMinutes}min = €${amount}`);

    // 5️⃣ Fin de session côté prof
    if (ws.role === "prof") {
      const prof = onlineProfessors.get(ws.userId);
      if (prof) {
        endSession(ws.userId);
      }
    }

    // 6️⃣ Réponse client
    safeSend(ws, {
      type: "visioSaved",
      minutes: billedMinutes,
      amount,
      paymentStatus,
      timestamp: new Date().toISOString()
    });

    return {
      success: true,
      minutes: billedMinutes,
      amount,
      paymentStatus
    };

  } catch (err) {
    console.error("❌ Erreur visio globale:", err);

    safeSend(ws, {
      type: "error",
      message: "Erreur lors de la sauvegarde",
      code: "VISIO_SAVE_ERROR"
    });

    return {
      success: false,
      error: err.message
    };
  }
}

// =======================================================
// APPEL ACCEPTÉ → notifier l'élève
// =======================================================
export function handleCallAccepted() {
  // ❌ Ne rien faire
}

// =======================================================
// DÉMARRAGE SESSION → notifier l'élève
// =======================================================
export function handleStartSession(ws, { roomId, studentId }, clients) {
  console.log("📊 handleStartSession:", studentId, "clients size:", clients.size);

  const student = clients.get(studentId);
  if (!student) {
    console.error("❌ Élève non trouvé:", studentId);
    return;
  }

  // 1️⃣ callAccepted → UNE SEULE FOIS
  safeSend(student, {
    type: "callAccepted",
    profId: ws.userId,
    profName: ws.prenom + " " + ws.nom,
    profVille: ws.ville,
    profPays: ws.pays,
    roomId,
    timestamp: new Date().toISOString()
  });

  // 2️⃣ startSession → prof
  safeSend(ws, {
    type: "startSession",
    roomId
  });

  // 3️⃣ startSession → élève
  safeSend(student, {
    type: "startSession",
    roomId
  });

  console.log("✅ Session démarrée proprement (une seule fois)");
}

// =======================================================
// SIGNALING WEBRTC
// =======================================================
export function handleWebRTCSignal(ws, { targetUserId, signal }, clients) {
  if (!targetUserId || !signal) {
    return safeSend(ws, {
      type: "error",
      message: "targetUserId et signal requis"
    });
  }

  const target = clients.get(targetUserId);
  if (!target || target.readyState !== 1) {
    return safeSend(ws, {
      type: "error",
      message: "Destinataire indisponible"
    });
  }

  safeSend(target, {
    type: "webrtcSignal",
    fromUserId: ws.userId,
    signal,
    timestamp: new Date().toISOString()
  });

  console.log(`🔗 WebRTC signal: ${ws.userId} → ${targetUserId}`);
}

// =======================================================
// UPDATE STATUS PROF
// =======================================================
export function updateStatus(ws, { status }, onlineProfessors) {
  const validStatuses = ["disponible", "appel_recu", "en_appel", "en_session", "occupe", "absent", "pending"];

  if (!status || !validStatuses.includes(status)) {
    return safeSend(ws, {
      type: "error",
      message: "Status invalide"
    });
  }

  ws.status = status;

  if (ws.role === "prof") {
    const prof = onlineProfessors.get(ws.userId);
    if (prof) {
      prof.status = status;
    }
  }

  console.log(`🔄 Statut: ${ws.userId} → ${status}`);
}

