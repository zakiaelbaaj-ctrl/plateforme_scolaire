// =======================================================
// ws/context.js
// Gestionnaire d'état partagé pour les WebSockets
// =======================================================

class WSContext {
  constructor() {
    // Liste de toutes les connexions actives
    this.clients = new Set();
  }

  // Ajouter un client lors de la connexion
  addClient(ws) {
    this.clients.add(ws);
  }

  // Retirer un client lors de la déconnexion
  removeClient(ws) {
    this.clients.delete(ws);
  }

  // Envoyer un message à un utilisateur spécifique par son ID
  sendToUser(userId, data) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.userId === userId && client.readyState === 1) {
        client.send(message);
      }
    });
  }
}

// Export d'une instance unique (Singleton)
const wsContext = new WSContext();
export default wsContext;
