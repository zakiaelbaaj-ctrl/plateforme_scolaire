// ============================================================
// CHAT DOMAIN SERVICE
// ============================================================

import { AppState } from "/js/core/state.js";
import { socketService } from "../../core/socket.service.js";
// ✔ Callback enregistré depuis le dashboard
let _onMessageCallback = null;

export const ChatService = {

  onMessage(cb) {
    _onMessageCallback = cb;
  },

  // ============================
  // ENVOI PROF - ELEVE
  // ============================
  send(text) {
    const roomId = AppState.currentRoomId;
    if (!roomId || !text) return;

    const cleanText = text.trim().substring(0, 2000);
    if (!cleanText) return;

    socketService.send({
      type: "chatMessage",   // ✅ inchangé pour prof élève
      roomId,
      text: cleanText
    });
  },

  // ============================
  // ENVOI ETUDIANT - ETUDIANT
  // ============================
  sendStudent(text) {
    const roomId = AppState.currentRoomId || "general";
    if (!text) return;

    const cleanText = text.trim().substring(0, 2000);
    if (!cleanText) return;

    socketService.send({
      type: "student:chatMessage",  // ✅ spécifique aux étudiants
      roomId,
      text: cleanText
    });
  },

  // ============================
  // RECEPTION
  // ============================
  handleEvent(event) {
    if (!event?.text) return;

    // ✅ accepte les deux types
    if (event.type !== "chatMessage" && event.type !== "student:chatMessage") return;

    const msg = {
      sender: event.sender || event.userName || "Utilisateur",
      text:   event.text
    };

    if (_onMessageCallback) _onMessageCallback(msg);
  }
};
