// ============================================================
// CHAT DOMAIN SERVICE
// ============================================================

import { AppState } from "/js/core/state.js";
import { SocketService } from "../../core/socket.service.js";
// ✅ Callback enregistré depuis le dashboard
let _onMessageCallback = null;

export const ChatService = {

  // ============================
  // ABONNEMENT UI
  // ============================

  // ✅ Ajouté — appelé depuis dashboard.js
  onMessage(cb) {
    _onMessageCallback = cb;
  },


  // ============================
  // ENVOI
  // ============================

  send(text) {
    const roomId = AppState.currentRoomId;
    if (!roomId || !text) return;

    const cleanText = text.trim().substring(0, 2000);
    if (!cleanText) return;

    SocketService.send({
      type: "chatMessage",
      roomId,
      text: cleanText
    });
  },


  // ============================
  // RÉCEPTION (appelé par SessionService)
  // ============================

  // ✅ Renommé receive() → handleEvent() pour correspondre
  // à l'appel dans SessionService
  handleEvent(event) {
    if (!event?.text) return;

    const msg = {
      sender: event.sender || event.userName || "Utilisateur",
      text:   event.text
    };

    // ✅ Émet vers le dashboard via le callback
    if (_onMessageCallback) _onMessageCallback(msg);
  }

};