// ws/etudiant/call.service.js
// ✅ Service d'APPEL DIRECT étudiant → étudiant (distinct du matching par file d'attente)
// Ne touche à rien d'existant : réutilise "student:matchFound" une fois l'appel accepté,
// donc rooms.js / orchestrateur / WebRTC restent 100% inchangés.

import { safeSend } from "../utils.js";
import { MatchRegistry } from "./match.registry.js";
import { StudentMatchService } from "./match.service.js";
import { clients } from "../../socket.js";

const CALL_TIMEOUT_MS = 30000; // 30s sans réponse → timeout automatique

function getDisplayName(ws) {
  const full = `${ws.prenom || ""} ${ws.nom || ""}`.trim();
  return full || `Étudiant #${ws.userId}`;
}

class _StudentCallService {
  constructor() {
    this.pendingCalls = new Map(); // callId -> { fromWs, toWs, timeout }
    this.busyByUser = new Map();   // userId -> callId (appelant OU appelé, en attente de réponse)
  }

  _generateCallId() {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  // ======================================================
  // 1️⃣ INITIER UN APPEL
  // ======================================================
  callUser(ws, targetUserId) {
    if (ws.role !== "etudiant") {
      return safeSend(ws, { type: "student:callError", message: "Fonctionnalité réservée aux étudiants." });
    }
    if (!targetUserId) {
      return safeSend(ws, { type: "student:callError", message: "Destinataire manquant." });
    }

    const targetId = parseInt(targetUserId, 10);
    if (targetId === ws.userId) {
      return safeSend(ws, { type: "student:callError", message: "Impossible de vous appeler vous-même." });
    }

    const targetWs = clients.get(targetId);
    if (!targetWs || targetWs.readyState !== 1) {
      return safeSend(ws, { type: "student:callError", message: "Cet étudiant n'est plus en ligne." });
    }
    if (targetWs.role !== "etudiant") {
      return safeSend(ws, { type: "student:callError", message: "Cet utilisateur ne peut pas être appelé." });
    }

    // 🔒 Ni l'appelant ni la cible ne doivent être déjà en session, en appel en attente,
    //    ou dans la file de matching (évite un conflit avec tryMatch()).
    const isQueued = (id) => StudentMatchService.queue?.some(e => e.userId === id);

    if (ws.studentRoomId || this.busyByUser.has(ws.userId) || isQueued(ws.userId)) {
      return safeSend(ws, { type: "student:callError", message: "Vous êtes déjà en appel, en session ou en file d'attente." });
    }
    if (targetWs.studentRoomId || this.busyByUser.has(targetId) || isQueued(targetId)) {
      return safeSend(ws, { type: "student:callError", message: "Cet étudiant est déjà occupé." });
    }

    const callId = this._generateCallId();
    const timeout = setTimeout(() => this._timeoutCall(callId), CALL_TIMEOUT_MS);

    this.pendingCalls.set(callId, { fromWs: ws, toWs: targetWs, timeout });
    this.busyByUser.set(ws.userId, callId);
    this.busyByUser.set(targetId, callId);

    safeSend(targetWs, {
      type: "student:incomingCall",
      callId,
      fromId: ws.userId,
      fromName: getDisplayName(ws),
      fromMatiere: ws.matiere || null,
      fromNiveau: ws.niveau || null,
    });

    safeSend(ws, {
      type: "student:callRinging",
      callId,
      toId: targetId,
      toName: getDisplayName(targetWs),
    });

    console.log(`📞 [étudiant] Appel direct : ${ws.userId} → ${targetId} (${callId})`);
  }

  // ======================================================
  // 2️⃣ ACCEPTER — réutilise EXACTEMENT le flux "matchFound" existant
  // ======================================================
  acceptCall(ws, callId) {
    const call = this.pendingCalls.get(callId);
    if (!call || call.toWs.userId !== ws.userId) {
      return safeSend(ws, { type: "student:callError", message: "Appel introuvable ou expiré." });
    }

    clearTimeout(call.timeout);
    this.pendingCalls.delete(callId);
    this.busyByUser.delete(call.fromWs.userId);
    this.busyByUser.delete(call.toWs.userId);

    // Préfixe "call_" pour distinguer visuellement des rooms issues du matching ("student_")
    const roomId = `call_${call.fromWs.userId}_${call.toWs.userId}_${Date.now()}`;
    MatchRegistry.register(roomId, call.fromWs.userId, call.toWs.userId);

    safeSend(call.fromWs, {
      type: "student:matchFound",
      roomId,
      partnerName: getDisplayName(call.toWs),
      partnerVille: call.toWs.ville || "",
      partnerPays: call.toWs.pays || "",
      initiator: true,
    });

    safeSend(call.toWs, {
      type: "student:matchFound",
      roomId,
      partnerName: getDisplayName(call.fromWs),
      partnerVille: call.fromWs.ville || "",
      partnerPays: call.fromWs.pays || "",
      initiator: false,
    });

    console.log(`✅ [étudiant] Appel accepté : room ${roomId}`);
  }

  // ======================================================
  // 3️⃣ REFUSER (par la cible)
  // ======================================================
  declineCall(ws, callId) {
    const call = this.pendingCalls.get(callId);
    if (!call || call.toWs.userId !== ws.userId) return;

    clearTimeout(call.timeout);
    this.pendingCalls.delete(callId);
    this.busyByUser.delete(call.fromWs.userId);
    this.busyByUser.delete(call.toWs.userId);

    safeSend(call.fromWs, {
      type: "student:callDeclined",
      toName: getDisplayName(call.toWs),
    });

    console.log(`🚫 [étudiant] Appel refusé : ${callId}`);
  }

  // ======================================================
  // 4️⃣ ANNULER (par l'appelant, avant réponse)
  // ======================================================
  cancelCall(ws, callId) {
    const call = this.pendingCalls.get(callId);
    if (!call || call.fromWs.userId !== ws.userId) return;

    clearTimeout(call.timeout);
    this.pendingCalls.delete(callId);
    this.busyByUser.delete(call.fromWs.userId);
    this.busyByUser.delete(call.toWs.userId);

    safeSend(call.toWs, {
      type: "student:callCancelled",
      fromName: getDisplayName(call.fromWs),
    });

    console.log(`🚫 [étudiant] Appel annulé par l'appelant : ${callId}`);
  }

  // ======================================================
  // 5️⃣ TIMEOUT AUTOMATIQUE (30s sans réponse)
  // ======================================================
  _timeoutCall(callId) {
    const call = this.pendingCalls.get(callId);
    if (!call) return;

    this.pendingCalls.delete(callId);
    this.busyByUser.delete(call.fromWs.userId);
    this.busyByUser.delete(call.toWs.userId);

    safeSend(call.fromWs, { type: "student:callTimeout", toName: getDisplayName(call.toWs) });
    safeSend(call.toWs, { type: "student:callCancelled", fromName: getDisplayName(call.fromWs), reason: "timeout" });

    console.log(`⏱️ [étudiant] Appel expiré (pas de réponse) : ${callId}`);
  }

  // ======================================================
  // 6️⃣ NETTOYAGE — appelé à la déconnexion d'un utilisateur
  // ======================================================
  cleanupUser(userId) {
    const callId = this.busyByUser.get(userId);
    if (!callId) return;

    const call = this.pendingCalls.get(callId);
    if (!call) { this.busyByUser.delete(userId); return; }

    clearTimeout(call.timeout);
    this.pendingCalls.delete(callId);
    this.busyByUser.delete(call.fromWs.userId);
    this.busyByUser.delete(call.toWs.userId);

    const other = call.fromWs.userId === userId ? call.toWs : call.fromWs;
    safeSend(other, { type: "student:callCancelled", reason: "disconnected" });

    console.log(`🧹 [étudiant] Appel nettoyé suite à déconnexion de ${userId}`);
  }
}

export const StudentCallService = new _StudentCallService();