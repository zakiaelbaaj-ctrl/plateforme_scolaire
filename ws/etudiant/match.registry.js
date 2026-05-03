// ws/etudiant/match.registry.js
// Registre des rooms étudiantes actives
// Créé par StudentMatchService au moment du match
// Consulté par rooms.js pour autoriser les joinRoom

const registry = new Map(); // roomId -> Set<userId>

export const MatchRegistry = {

    // Appelé par match.service.js quand un match est trouvé
    register(roomId, userIdA, userIdB) {
        registry.set(roomId, new Set([userIdA, userIdB]));
        console.log(`📋 MatchRegistry: room enregistrée ${roomId}`);
    },

    // La room existe-t-elle ?
    exists(roomId) {
        return registry.has(roomId);
    },

    // Cet étudiant est-il autorisé dans cette room ?
    isAllowed(roomId, userId) {
        return registry.get(roomId)?.has(userId) ?? false;
    },

    // Appelé par rooms.js quand la room se vide
    unregister(roomId) {
        registry.delete(roomId);
        console.log(`📋 MatchRegistry: room supprimée ${roomId}`);
    }
};