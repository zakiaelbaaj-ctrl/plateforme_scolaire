// ============================================
// ws/chat/rooms.js
// ============================================

export const rooms = new Map(); // roomId → Set(ws)

export function joinRoom(roomId, ws) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
}

export function leaveRoom(roomId, ws) {
  if (rooms.has(roomId)) {
    rooms.get(roomId).delete(ws);
  }
}
