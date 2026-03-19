// ============================================
// ws/signaling/index.js
// ============================================

import * as handlers from "./handlers.js";

export default function signalingRouter(ws, data) {
  switch (data.type) {
    case "rtc:offer":
      return handlers.offer(ws, data);

    case "rtc:answer":
      return handlers.answer(ws, data);

    case "rtc:ice":
      return handlers.ice(ws, data);

    default:
      ws.send(JSON.stringify({ type: "rtc:error", message: "Event inconnu" }));
  }
}
