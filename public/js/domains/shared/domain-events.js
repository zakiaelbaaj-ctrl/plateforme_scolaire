export class DomainEvents {

  constructor() {
    this.listeners = new Map();
  }

  subscribe(eventName, callback) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);
  }

  dispatch(eventName, payload) {
    const handlers = this.listeners.get(eventName) || [];
    for (const handler of handlers) {
      handler(payload);
    }
  }
}