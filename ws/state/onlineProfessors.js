//ws/state/onlineProfessors.js
// ==========================================
// Gestion des professeurs connectés en ligne
// ==========================================
console.log(">>> Chargement du fichier ws/state/onlineProfessors.js");

// Map pour stocker les professeurs en ligne
const onlineProfessors = new Map();

/**
 * Ajouter un professeur à la liste en ligne
 */
function addProfessor(prof) {
  if (!prof.id) return;
  // 🔥 IMPORTANT : stocker la WebSocket 
  if (!prof.ws) { 
    console.warn("⚠️ addProfessor appelé sans ws !"); 
  }
  prof.status = "disponible";
  onlineProfessors.set(prof.id, prof);
  console.log(`✅ Professeur connecté : ${prof.prenom} ${prof.nom} (${prof.id})`);
}

/**
 * Supprimer un professeur de la liste en ligne
 */
function removeProfessor(profId) {
  if (!onlineProfessors.has(profId)) return;
  const prof = onlineProfessors.get(profId);
  onlineProfessors.delete(profId);
  console.log(`👋 Professeur déconnecté : ${prof.prenom} ${prof.nom} (${prof.id})`);
}

/**
 * Mettre à jour le statut d’un professeur
 */
function updateStatus(profId, status) {
  if (!onlineProfessors.has(profId)) return;
  const prof = onlineProfessors.get(profId);
  prof.status = status;
  onlineProfessors.set(profId, prof);
}

/**
 * Formatage durée
 */
function formatDuration(ms) {
  if (!ms) return "0s";
  const minutes = Math.floor(ms / 60);
  const seconds = ms % 60;
  return minutes > 0 ? `${minutes} min ${seconds}s` : `${seconds}s`;
}
/**
 * Démarrer une session pour un professeur
 */
function startSession(profId, eleveId) {
  if (!onlineProfessors.has(profId)) return;
  const prof = onlineProfessors.get(profId);

  prof.status = "en_session"; // au lieu de "en session"
  prof.eleveId = eleveId;
  prof.sessionStartedAt = new Date().toISOString();

  onlineProfessors.set(profId, prof);
  console.log(`🎬 Session démarrée pour prof ${profId} avec élève ${eleveId}`);
}

function endSession(profId) {
  if (!onlineProfessors.has(profId)) return;
  const prof = onlineProfessors.get(profId);
  prof.eleveId = null;
  prof.sessionStartedAt = null;
  prof.status = "disponible";
}

/**
 * Retourne la liste des professeurs en ligne (sans WebSocket)
 */
export function getOnlineProfessors() {
  const profs = [];
  const now = new Date();

  for (const prof of onlineProfessors.values()) {
    const connectedAt = prof.connectedAt ? new Date(prof.connectedAt) : now;
    const lastActiveAt = prof.lastActiveAt ? new Date(prof.lastActiveAt) : connectedAt;

    const tempsDepuisConnexion = Math.floor((now - connectedAt) / 1000);
    const tempsDepuisActivite = Math.floor((now - lastActiveAt) / 1000);

    const estActif = tempsDepuisActivite < 300; // 5 min
    const disponibiliteReelle = prof.status === "disponible" && estActif;

    profs.push({
      id: prof.id,
      prenom: prof.prenom,
      nom: prof.nom,
      role: "prof",
      ville: prof.ville,
      pays: prof.pays,
      matiere: prof.matiere || null,
      status: prof.status,
      disponibilite: disponibiliteReelle,
      connectedAt: prof.connectedAt,
      lastActiveAt: prof.lastActiveAt,
      tempsDepuisConnexion,
      tempsDepuisActivite,
      tempsDepuisConnexionFormaté: formatDuration(tempsDepuisConnexion),
      tempsDepuisActiviteFormaté: formatDuration(tempsDepuisActivite),
      eleveEnSession: prof.eleveId || null,
      sessionStartedAt: prof.sessionStartedAt || null
    });
  }

  return profs.sort((a, b) => {
    if (a.disponibilite !== b.disponibilite) {
      return a.disponibilite ? -1 : 1;
    }
    return new Date(b.lastActiveAt) - new Date(a.lastActiveAt);
  });
}

export {
  onlineProfessors,
  addProfessor,
  removeProfessor,
  updateStatus,
  startSession,
  endSession
};
