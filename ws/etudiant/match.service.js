// ws/etudiant/match.service.js
// ✅ Service de matching étudiant-étudiant
// ✅ Import safeSend corrigé (chemin relatif depuis ws/etudiant/)
// ✅ Conflit de nom classe/export corrigé

import { safeSend } from "../utils.js";          // ✅ était "../ws/utils.js" → incorrect
import { MatchRegistry } from "./match.registry.js";

// ======================================================
// CLASSE (nom interne _StudentMatchService)
// pour éviter le conflit avec l'export const StudentMatchService
// ======================================================
class _StudentMatchService {

  constructor() {
    this.queue = [];
  }

  // ======================================================
  // 1️⃣ AJOUT DANS LA FILE
  // ======================================================
  enqueueStudent(ws, matiere, sujet, niveau) {

    // 🔴 sécurité : PROF interdit
    if (ws.role === "prof") {
      return safeSend(ws, {
        type: "error",
        message: "Les professeurs ne peuvent pas utiliser le matching étudiant."
      });
    }

    // 🔴 admin interdit
    if (ws.role === "admin") {
      return safeSend(ws, {
        type: "error",
        message: "Action non autorisée."
      });
    }

    // 🔴 abonnement requis
    if (ws.subscriptionStatus !== "active") {
      return safeSend(ws, {
        type: "error",
        code: "NO_SUBSCRIPTION",
        message: "Abonnement requis pour accéder au matching étudiant."
      });
    }

    // 🔴 déjà en session
    if (ws.studentRoomId) {
      return safeSend(ws, {
        type: "error",
        message: "Vous êtes déjà en session."
      });
    }

    // 🔴 déjà en file
    const alreadyQueued = this.queue.find(e => e.userId === ws.userId);
    if (alreadyQueued) {
      return safeSend(ws, {
        type: "error",
        message: "Vous êtes déjà en file d'attente."
      });
    }

    // ➕ ajout queue
    this.queue.push({
      ws,
      userId: ws.userId,
      role: ws.role,           // eleve ou etudiant
      matiere,
      sujet,
      niveau,
      disponibilite: ws.disponibilite || "now",
      ts: Date.now()
    });

    console.log(`➕ ${ws.role} ${ws.userId} ajouté matching étudiant`);

    // Confirmer à l'étudiant qu'il est en file
    safeSend(ws, {
      type: "student:queued",
      message: "En attente d'un partenaire...",
      matiere,
      niveau
    });

    this.tryMatch();
  }

  // ======================================================
  // 2️⃣ MATCHING
  // ======================================================
  tryMatch() {

    if (this.queue.length < 2) return;

    const now = Date.now();

    let bestPair = null;
    let bestScore = -1;

    for (let i = 0; i < this.queue.length; i++) {
      for (let j = i + 1; j < this.queue.length; j++) {

        const a = this.queue[i];
        const b = this.queue[j];

        let score = 0;

        // 🔵 même matière obligatoire
        if (a.matiere !== b.matiere) continue;

        // 🔵 niveau
        if (a.niveau === b.niveau) score += 25;

        // 🔵 sujet similaire
        if (this._subjectSimilarity(a.sujet, b.sujet) > 0.5) {
          score += 20;
        }

        // 🔵 disponibilité
        score += this._availabilityScore(a.disponibilite, b.disponibilite);

        // 🔵 temps d'attente (bonus progressif, max 30pts après 30s)
        const wait = Math.min(now - a.ts, now - b.ts);
        score += Math.min(wait / 1000, 30);

        if (score > bestScore) {
          bestScore = score;
          bestPair = { a, b };
        }
      }
    }

    if (!bestPair) return;

    // ======================================================
    // 3️⃣ CRÉATION ROOM ÉTUDIANT
    // ======================================================
    this.queue = this.queue.filter(
      e => e !== bestPair.a && e !== bestPair.b
    );

    const roomId = `student_${bestPair.a.userId}_${bestPair.b.userId}`;

    // Pré-assigner la room sur les ws (rooms.js vérifiera via MatchRegistry)
    bestPair.a.ws.studentRoomId = roomId;
    bestPair.b.ws.studentRoomId = roomId;

    // Enregistrer dans le registre pour autoriser le joinRoom
    MatchRegistry.register(roomId, bestPair.a.userId, bestPair.b.userId);

    console.log(`🎯 Student room créée: ${roomId}`);

    // ======================================================
    // 4️⃣ NOTIFICATION — les clients doivent envoyer student:joinRoom
    // ======================================================
    safeSend(bestPair.a.ws, {
      type: "student:matchFound",
      roomId,
      partnerName: `${bestPair.b.ws.prenom} ${bestPair.b.ws.nom}`
    });

    safeSend(bestPair.b.ws, {
      type: "student:matchFound",
      roomId,
      partnerName: `${bestPair.a.ws.prenom} ${bestPair.a.ws.nom}`
    });
  }

  // ======================================================
  // 5️⃣ REMOVE QUEUE
  // ======================================================
  removeStudent(userId) {
    const before = this.queue.length;
    this.queue = this.queue.filter(e => e.userId !== userId);
    if (this.queue.length < before) {
      console.log(`➖ ${userId} retiré de la file matching étudiant`);
    }
  }

  // ======================================================
  // 6️⃣ UTILITAIRES
  // ======================================================
  _subjectSimilarity(a, b) {
    if (!a || !b) return 0;
    a = a.toLowerCase();
    b = b.toLowerCase();
    const A = a.split(" ");
    const B = b.split(" ");
    const common = A.filter(w => B.includes(w));
    return common.length / Math.max(A.length, B.length);
  }

  _availabilityScore(a, b) {
    if (!a || !b) return 0;
    if (a === "now" && b === "now") return 25;
    if (a === b) return 15;
    return 0;
  }
}

// ✅ Export singleton — nom de classe différent pour éviter le conflit
export const StudentMatchService = new _StudentMatchService();