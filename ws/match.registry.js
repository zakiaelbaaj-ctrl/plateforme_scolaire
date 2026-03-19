// ======================================================
// MATCH REGISTRY — SÉCURITÉ & TRAÇABILITÉ DES ROOMS
// ======================================================
//
// Ce module garde la liste des rooms actives créées par le
// système de matching étudiant.
//
// Objectifs :
//  - Vérifier qu’un utilisateur a le droit d’entrer dans une room
//  - Empêcher un étudiant d’accéder à une room qui n’est pas la sienne
//  - Nettoyer les rooms terminées
//
// ======================================================

class MatchRegistryClass {

  constructor() {
    // Map : roomId → [idEtudiantA, idEtudiantB]
    this.rooms = new Map();
  }

  // --------------------------------------------------
  // Enregistrer une nouvelle room
  // --------------------------------------------------
  register(roomId, idA, idB) {
    this.rooms.set(roomId, [idA, idB]);
    console.log(`📌 MatchRegistry: room ${roomId} enregistrée pour ${idA} ↔ ${idB}`);
  }

  // --------------------------------------------------
  // Vérifier si un utilisateur appartient à une room
  // --------------------------------------------------
  isUserInRoom(userId, roomId) {
    const users = this.rooms.get(roomId);
    if (!users) return false;
    return users.includes(userId);
  }

  // --------------------------------------------------
  // Récupérer les deux utilisateurs d’une room
  // --------------------------------------------------
  getUsers(roomId) {
    return this.rooms.get(roomId) || null;
  }

  // --------------------------------------------------
  // Supprimer une room (fin de session)
  // --------------------------------------------------
  remove(roomId) {
    if (this.rooms.has(roomId)) {
      this.rooms.delete(roomId);
      console.log(`🗑️ MatchRegistry: room ${roomId} supprimée`);
    }
  }

  // --------------------------------------------------
  // Supprimer toutes les rooms d’un utilisateur (déconnexion)
  // --------------------------------------------------
  removeUserFromAllRooms(userId) {
    for (const [roomId, users] of this.rooms.entries()) {
      if (users.includes(userId)) {
        this.rooms.delete(roomId);
        console.log(`🗑️ MatchRegistry: room ${roomId} supprimée (déconnexion ${userId})`);
      }
    }
  }
}

export const MatchRegistry = new MatchRegistryClass();
