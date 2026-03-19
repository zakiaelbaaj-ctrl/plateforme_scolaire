// ============================================
// ws/signaling/handlers.js
// ============================================

import { safeSend } from "../utils.js";

export function offer(ws, data) {
  safeSend(ws, { type: "rtc:offer:received" });
}

export function answer(ws, data) {
  safeSend(ws, { type: "rtc:answer:received" });
}

export function ice(ws, data) {
  safeSend(ws, { type: "rtc:ice:received" });
}
