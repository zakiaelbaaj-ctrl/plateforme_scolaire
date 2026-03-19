// ws/state/state.interface.js
// Interface abstraite pour la gestion de l'état côté WebSocket.
// Les classes concrètes doivent étendre cette classe et implémenter les méthodes.

export default class WsStateInterface {
  constructor() {
    if (new.target === WsStateInterface) {
      throw new Error(
        'WsStateInterface est une classe abstraite et ne peut pas être instanciée directement'
      );
    }
  }

  // --- Clients -----------------------------------------------------------

  /**
   * Enregistrer ou mettre à jour un client.
   * @param {string} clientId
   * @param {object} ws - objet websocket ou équivalent
   * @param {object} [meta]
   */
  registerClient(clientId, ws, meta = {}) {
    throw new Error('Méthode registerClient non implémentée');
  }

  /**
   * Supprimer un client par son identifiant.
   * @param {string} clientId
   * @returns {boolean|Promise<boolean>}
   */
  removeClient(clientId) {
    throw new Error('Méthode removeClient non implémentée');
  }

  /**
   * Récupérer un client (ou undefined si absent).
   * @param {string} clientId
   * @returns {object|undefined|Promise<object|undefined>}
   */
  getClient(clientId) {
    throw new Error('Méthode getClient non implémentée');
  }

  /**
   * Récupérer la liste de tous les clients.
   * @returns {Array<{ id: string, ws?: any, meta?: any }>|Promise<Array>}
   */
  getAllClients() {
    throw new Error('Méthode getAllClients non implémentée');
  }

  // --- Appels / sessions -------------------------------------------------

  /**
   * Créer ou mettre à jour une entrée d'appel (call).
   * @param {string} callId
   * @param {any} payload
   */
  createCall(callId, payload) {
    throw new Error('Méthode createCall non implémentée');
  }

  /**
   * Récupérer une entrée d'appel.
   * @param {string} callId
   * @returns {any|undefined|Promise<any|undefined>}
   */
  getCall(callId) {
    throw new Error('Méthode getCall non implémentée');
  }

  /**
   * Terminer / supprimer une entrée d'appel.
   * @param {string} callId
   * @returns {boolean|Promise<boolean>}
   */
  endCall(callId) {
    throw new Error('Méthode endCall non implémentée');
  }

  // --- Messaging helpers -------------------------------------------------

  /**
   * Envoyer un message à un client spécifique.
   * @param {string} clientId
   * @param {any} message
   * @returns {boolean|Promise<boolean>}
   */
  sendToClient(clientId, message) {
    throw new Error('Méthode sendToClient non implémentée');
  }

  /**
   * Diffuser un message à tous les clients (option excludeIds).
   * @param {any} message
   * @param {{ excludeIds?: string[] }} [options]
   * @returns {number|Promise<number>} nombre de clients ciblés
   */
  broadcast(message, options = {}) {
    throw new Error('Méthode broadcast non implémentée');
  }

  // --- Stockage générique ------------------------------------------------

  /**
   * Stocker une donnée d'état générique (clé/valeur).
   * @param {string} key
   * @param {any} value
   */
  setState(key, value) {
    throw new Error('Méthode setState non implémentée');
  }

  /**
   * Récupérer une donnée d'état par clé.
   * @param {string} key
   * @returns {any|Promise<any>}
   */
  getState(key) {
    throw new Error('Méthode getState non implémentée');
  }

  /**
   * Vider l'état (utile pour réinitialiser entre tests).
   */
  clear() {
    throw new Error('Méthode clear non implémentée');
  }
}
