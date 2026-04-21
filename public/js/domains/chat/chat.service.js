// ============================================================
// CHAT DOMAIN SERVICE
// ============================================================

import { AppState } from "/js/core/state.js";
import { socketService } from "../../core/socket.service.js";
// âœ… Callback enregistrÃ© depuis le dashboard
let _onMessageCallback = null;

export const ChatService = {

  // ============================
  // ABONNEMENT UI
  // ============================

  // âœ… AjoutÃ© â€” appelÃ© depuis dashboard.js
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

    socketService.send({
      type: "chatMessage",
      roomId,
      text: cleanText
    });
  },


  // ============================
  // RÃ‰CEPTION (appelÃ© par SessionService)
  // ============================

  // âœ… RenommÃ© receive() â†’ handleEvent() pour correspondre
  // Ã  l'appel dans SessionService
  handleEvent(event) {
    if (!event?.text) return;

    const msg = {
      sender: event.sender || event.userName || "Utilisateur",
      text:   event.text
    };

    // âœ… Ã‰met vers le dashboard via le callback
    if (_onMessageCallback) _onMessageCallback(msg);
  }

};

