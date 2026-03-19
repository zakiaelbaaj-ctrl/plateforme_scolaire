// public/js/core/eventBus.js
const listeners = new Map();

export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => off(event, cb);
}

export function off(event, cb) {
  if (!listeners.has(event)) return;
  listeners.get(event).delete(cb);
  if (!listeners.get(event).size === 0) listeners.delete(event);
}

export function emit(event, payload) {
  if (!listeners.has(event)) return;
  for (const cb of Array.from(listeners.get(event))) {
    try { cb(payload); } 
    catch (err) { console.error(`EventBus error on "${event}":`, err); }
  }
}

export function clear(event) {
  if (!listeners.has(event)) return;
  listeners.delete(event);
}