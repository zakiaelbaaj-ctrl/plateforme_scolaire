// ws/state/memory.state.js
import WsStateInterface from './state.interface.js';

export default class MemoryWsState extends WsStateInterface {
  constructor() {
    super();
    /** @type {Map<string, { ws?: any, meta?: any }>} */
    this.clients = new Map();
    /** @type {Map<string, any>} */
    this.calls = new Map();
    /** @type {Map<string, any>} */
    this.store = new Map();
  }

  // Clients
  registerClient(clientId, ws, meta = {}) {
    if (!clientId) throw new Error('registerClient: clientId requis');
    this.clients.set(String(clientId), { ws, meta });
  }

  addClient(client) {
    if (!client || !client.id) throw new Error('addClient: client.id requis');
    this.registerClient(client.id, client.ws, client.meta || {});
  }

  removeClient(clientId) {
    return this.clients.delete(String(clientId));
  }

  getClient(clientId) {
    return this.clients.get(String(clientId));
  }

  getAllClients() {
    return Array.from(this.clients.entries()).map(([id, { ws, meta }]) => ({ id, ws, meta }));
  }

  // Calls
  createCall(callId, payload) {
    if (!callId) throw new Error('createCall: callId requis');
    this.calls.set(String(callId), payload);
  }

  getCall(callId) {
    return this.calls.get(String(callId));
  }

  endCall(callId) {
    return this.calls.delete(String(callId));
  }

  // Messaging helpers
  sendToClient(clientId, message) {
    const client = this.getClient(clientId);
    if (!client) return false;
    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    try {
      if (client.ws && typeof client.ws.send === 'function') {
        if (typeof client.ws.readyState === 'number' && client.ws.readyState !== 1) {
          client.meta = { ...(client.meta || {}), lastMessage: payload };
          this.clients.set(String(clientId), client);
          return false;
        }
        client.ws.send(payload);
        return true;
      } else {
        client.meta = { ...(client.meta || {}), lastMessage: payload };
        this.clients.set(String(clientId), client);
        return true;
      }
    } catch (err) {
      client.meta = { ...(client.meta || {}), lastError: String(err) };
      this.clients.set(String(clientId), client);
      return false;
    }
  }

  broadcast(message, options = {}) {
    const exclude = new Set((options.excludeIds || []).map(String));
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    let count = 0;

    for (const [id, client] of this.clients.entries()) {
      if (exclude.has(id)) continue;
      try {
        if (client.ws && typeof client.ws.send === 'function' && client.ws.readyState === 1) {
          client.ws.send(payload);
        } else {
          client.meta = { ...(client.meta || {}), lastMessage: payload };
          this.clients.set(id, client);
        }
        count++;
      } catch (err) {
        client.meta = { ...(client.meta || {}), lastError: String(err) };
        this.clients.set(id, client);
      }
    }

    return count;
  }

  // Generic store
  setState(key, value) {
    this.store.set(String(key), value);
  }

  getState(key) {
    return this.store.get(String(key));
  }

  // Utilitaires
  clear() {
    this.clients.clear();
    this.calls.clear();
    this.store.clear();
  }
}
