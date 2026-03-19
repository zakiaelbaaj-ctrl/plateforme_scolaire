// ======================================================
// MATCH SERVICE — PAIRING AUTOMATIQUE ENTRE ÉTUDIANTS
// ======================================================

import { safeSend } from "./utils.js";
import { MatchRegistry } from "./match.registry.js";
import { TwilioService } from "./twilio.service.js";

class MatchServiceClass {

  constructor() {
    // File d’attente des étudiants en attente de match
    this.queue = []; // { ws, userId, matiere, sujet, ts }
  }

  // --------------------------------------------------
  // 1️⃣ Ajouter un étudiant dans la file d’attente
  // --------------------------------------------------
  enqueueStudent(ws, matiere, sujet, niveau) {

    // Sécurité : seuls les élèves peuvent demander un match
    if (ws.role !== "eleve") {
      return safeSend(ws, {
        type: "error",
        message: "Seuls les étudiants peuvent demander un matching."
      });
    }

    // Déjà en session ?
    if (ws.roomId) {
      return safeSend(ws, {
        type: "error",
        message: "Vous êtes déjà en session."
      });
    }

    // Ajouter à la queue
    this.queue.push({
  ws,
  userId: ws.userId,
  matiere,
  sujet,
  niveau,
  disponibilite: ws.disponibilite || "now",
  ts: Date.now()
});


    console.log(`➕ Étudiant ${ws.userId} ajouté à la queue (${matiere}, ${sujet})`);

    // Essayer de matcher
    this.tryMatch();
  }

  // --------------------------------------------------
  // 2️⃣ Tentative de matching
  // --------------------------------------------------
 tryMatch() {
  if (this.queue.length < 2) return;

  const now = Date.now();

  // 1️⃣ On calcule les compatibilités
  let bestPair = null;
  let bestScore = -1;

  for (let i = 0; i < this.queue.length; i++) {
    for (let j = i + 1; j < this.queue.length; j++) {

      const a = this.queue[i];
      const b = this.queue[j];

      let score = 0;

      // Matière obligatoire
      if (a.matiere !== b.matiere) continue;

      // Niveau (fort)
      if (a.niveau === b.niveau) score += 30;

      // Sujet (similarité simple)
      if (this._subjectSimilarity(a.sujet, b.sujet) > 0.5) score += 20;
      
      // Disponibilité
      const dispoScore = this._availabilityScore(a.disponibilite, b.disponibilite);
      score += dispoScore;

      // Bonus si les deux attendent longtemps
      const waitA = now - a.ts;
      const waitB = now - b.ts;
      const waitBonus = Math.min(waitA, waitB) / 1000; // 1 point par seconde
      score += Math.min(waitBonus, 30);

      if (score > bestScore) {
        bestScore = score;
        bestPair = { a, b };
      }
    }
  }

  if (!bestPair) return;

  // 2️⃣ On retire les deux étudiants de la queue
  this.queue = this.queue.filter(e => e !== bestPair.a && e !== bestPair.b);

  // 3️⃣ On crée la room
  const roomId = `room_${bestPair.a.userId}_${bestPair.b.userId}_${Date.now()}`;

  MatchRegistry.register(roomId, bestPair.a.userId, bestPair.b.userId);

  bestPair.a.ws.roomId = roomId;
  bestPair.b.ws.roomId = roomId;

  TwilioService.createRoom(roomId);

  // 4️⃣ On notifie les deux étudiants
  safeSend(bestPair.a.ws, {
    type: "matchFound",
    roomId,
    partnerName: `${bestPair.b.ws.prenom} ${bestPair.b.ws.nom}`
  });

  safeSend(bestPair.b.ws, {
    type: "matchFound",
    roomId,
    partnerName: `${bestPair.a.ws.prenom} ${bestPair.a.ws.nom}`
  });
}


  // --------------------------------------------------
  // 3️⃣ Nettoyage si un étudiant quitte
  // --------------------------------------------------
  removeFromQueue(userId) {
    this.queue = this.queue.filter(e => e.userId !== userId);
  }
  // -------------------------------------------------- 
  // 🔍 UTILITAIRE : similarité entre deux sujets 
  // --------------------------------------------------
  _subjectSimilarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase();
  b = b.toLowerCase();
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  const common = wordsA.filter(w => wordsB.includes(w));
  return common.length / Math.max(wordsA.length, wordsB.length);
}
// --------------------------------------------------
// 🔍 UTILITAIRE : compatibilité de disponibilité
// --------------------------------------------------
_availabilityScore(a, b) {
  if (!a || !b) return 0;

  // Cas simple : les deux sont "now"
  if (a === "now" && b === "now") return 30;

  // Cas : les deux ont la même plage horaire
  if (a === b) return 20;

  // Cas : plages compatibles (ex : "18-20" et "19-21")
  if (a.includes("-") && b.includes("-")) {
    const [aStart, aEnd] = a.split("-").map(Number);
    const [bStart, bEnd] = b.split("-").map(Number);

    const overlap = Math.min(aEnd, bEnd) - Math.max(aStart, bStart);
    if (overlap > 0) return 15;
  }

  // Cas : un est "now", l’autre a une plage qui inclut l’heure actuelle
  const hour = new Date().getHours();
  if (a === "now" && b.includes("-")) {
    const [bStart, bEnd] = b.split("-").map(Number);
    if (hour >= bStart && hour <= bEnd) return 10;
  }
  if (b === "now" && a.includes("-")) {
    const [aStart, aEnd] = a.split("-").map(Number);
    if (hour >= aStart && hour <= aEnd) return 10;
  }

  return 0;
}


}

export const MatchService = new MatchServiceClass();
