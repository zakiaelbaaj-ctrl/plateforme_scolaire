// public/unit/setupTests.js
// Initialisation pour Vitest/jsdom: polyfills et mocks globaux

// Polyfill fetch for tests
import 'whatwg-fetch';

// Optional: web streams polyfill for streaming tests
import 'web-streams-polyfill/ponyfill';

// Provide a simple localStorage/sessionStorage polyfill if unavailable
if (typeof globalThis.localStorage === 'undefined') {
  const _store = new Map();
  globalThis.localStorage = {
    getItem(key) { return _store.has(key) ? _store.get(key) : null; },
    setItem(key, value) { _store.set(String(key), String(value)); },
    removeItem(key) { _store.delete(key); },
    clear() { _store.clear(); }
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const _s = new Map();
  globalThis.sessionStorage = {
    getItem(key) { return _s.has(key) ? _s.get(key) : null; },
    setItem(key, value) { _s.set(String(key), String(value)); },
    removeItem(key) { _s.delete(key); },
    clear() { _s.clear(); }
  };
}

// Minimal WebSocket mock helper (tests can override)
class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.readyState = 1;
    this.sent = [];
    setTimeout(() => this.onopen && this.onopen({}), 0);
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose && this.onclose({}); }
}
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = MockWebSocket;
}

// Helpful globals for tests
globalThis.__TEST__ = true;
