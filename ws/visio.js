// =======================================================
// WS.VISIO.JS – Gestion des sessions vidéo & facturation
// =======================================================

import { pool } from "../config/db.js";
import { safeSend } from "./utils.js";
import { endSession } from "./state/onlineProfessors.js";
import * as StripeService from "../services/payment.service.js"; // 👈 Ajoute cet import en haut
// ws/visio.js

export async function saveVisioSession(ws, { roomId, duration, matiere }) {
  // 🔒 Seule l'élève envoie la durée
  if (ws.role !== "eleve") return;

  if (!ws.userId || !roomId || duration == null) return;

  const durationSec = parseInt(duration, 10);
  if (isNaN(durationSec) || durationSec < 5) {
    console.warn("⛔ Session trop courte pour être enregistrée:", durationSec);
    return;
  }

  console.log(`💾 Sauvegarde de la durée en DB: ${durationSec}s pour la room ${roomId}`);

  try {
    // 1️⃣ Trouver le professeur associé à la room
    const { rows } = await pool.query(
      `SELECT prof_id FROM rooms WHERE room_name = $1`,
      [roomId]
    );
    if (rows.length === 0) throw new Error("Room introuvable");
    const professorId = rows[0].prof_id;

    // 2️⃣ SAUVEGARDE EN DB
    await pool.query(
      `INSERT INTO visio_sessions
       (user_id, professor_id, room_id, start_time, end_time, duration_seconds, matiere, payment_status)
       VALUES ($1, $2, $3, NOW() - $4 * INTERVAL '1 second', NOW(), $4, $5, 'pending')`,
      [ws.userId, professorId, roomId, durationSec, matiere || null]
    );

    console.log(`✅ Durée sauvegardée en DB (${durationSec}s).`);

    // 3️⃣ DÉCLENCHEMENT DU PAIEMENT AVEC DÉLAI DE SÉCURITÉ 🚀
    // On attend 1 seconde pour laisser la DB finir d'écrire avant que Stripe ne lise.
    setTimeout(async () => {
      console.log(`💳 Lancement du service de paiement pour ${roomId}...`);
      try {
        await StripeService.processSessionPayment(roomId);
        console.log("✅ Processus de paiement terminé.");
      } catch (stripeErr) {
        console.error("❌ Erreur lors du paiement automatique:", stripeErr.message);
      }
    }, 1000); // 1 seconde de battement

    // Accusé de réception au client
    safeSend(ws, { type: "visioSaved", status: "recorded" });

  } catch (err) {
    console.error("❌ Erreur sauvegarde visio:", err.message);
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

