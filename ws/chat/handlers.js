// ============================================
// ws/chat/handlers.js
// ============================================

import { safeSend } from "../utils.js";
import { rooms, joinRoom } from "./rooms.js";

export function handle(ws, data) {
  switch (data.type) {
    case "chat:join":
      joinRoom(data.roomId, ws);
      return safeSend(ws, { type: "chat:joined", roomId: data.roomId });

    case "chat:message":
      if (!rooms.has(data.roomId)) return;
      for (const client of rooms.get(data.roomId)) {
        safeSend(client, {
          type: "chat:message",
          from: ws.user?.id,
          text: data.text
        });
      }
      break;

    default:
      safeSend(ws, { type: "chat:error", message: "Event inconnu" });
  }
}
