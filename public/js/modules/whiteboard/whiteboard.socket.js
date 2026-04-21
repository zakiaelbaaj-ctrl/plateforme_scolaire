// ======================================================
// WHITEBOARD SOCKET â€” SYNCHRO TEMPS RÃ‰EL (BACKEND-ALIGNED)
// ======================================================

import { sendWs, registerWsHandler } from "../../core/socket.service.js";

export const WhiteboardSocket = {

  _enabled: false,
  _handlerRegistered: false,
  _roomJoined: false,
  roomId: null,
  // --------------------------------------------------
  // ACTIVATION DE LA SYNCHRO
  // --------------------------------------------------
  enableSync(roomId) {

  if (!roomId) return;

  if (this._enabled && this.roomId === roomId) return;

  this._enabled = true;
  this.roomId   = roomId;
  this._roomJoined = false;

 if (!this._handlerRegistered) {
  this._wsHandler = this._handleWs.bind(this);
  registerWsHandler(this._wsHandler);
  this._handlerRegistered = true;
}

  console.log("ðŸšª Envoi joinRoom:", roomId);

  // joinRoom dÃ©jÃ  gÃ©rÃ© par SessionService
},

  // --------------------------------------------------
  // DÃ‰SACTIVATION
  // --------------------------------------------------
  disableSync() {
  this._enabled = false;
  this.roomId   = null;
  this._roomJoined = false;
},

  // --------------------------------------------------
  // ROUTAGE DES MESSAGES WEBSOCKET
  // --------------------------------------------------
  _handleWs(data) {

    if (!this._enabled || !data || !data.type) return;

    switch (data.type) {
      case "joinedRoom": {

  if (data.roomId !== this.roomId) return;

  console.log("âœ… Room confirmÃ©e par backend:", data.roomId);

  this._roomJoined = true;

  // Maintenant seulement on demande le sync
  sendWs({
    type: "tableauSync",
    roomId: this.roomId
  });

  break;
}

      case "tableauStroke": {
        const stroke = data.data?.stroke ?? data.stroke ?? null;

        if (stroke && typeof this.onRemoteStroke === "function") {
          this.onRemoteStroke(stroke);
        }
        break;
      }

      case "tableauClear": {
        if (typeof this.onRemoteClear === "function") {
          this.onRemoteClear(false);
        }
        break;
      }

      case "tableauSync": {
        if (typeof this.onRemoteSync === "function") {
          this.onRemoteSync(data.strokes || []);
        }
        break;
      }

      default:
        break;
    }
  },

  // --------------------------------------------------
  // ENVOI D'UN STROKE
  // --------------------------------------------------
  sendStroke(stroke) {

    // ðŸ›¡ VÃ©rification minimale cohÃ©rente avec ton core
    if (!stroke || !stroke.tool) return;
    if (!this._enabled || !this.roomId || !this._roomJoined) return;

    sendWs({
      type: "tableauStroke",
        roomId: this.roomId,
        stroke
      
    });
  },

  // --------------------------------------------------
  // ENVOI DU CLEAR
  // --------------------------------------------------
  sendClear() {

    if (!this._enabled || !this.roomId || !this._roomJoined) return;

    sendWs({
      type: "tableauClear",
      roomId: this.roomId
    });
  },

  // --------------------------------------------------
  // CALLBACKS (dÃ©finis par WhiteboardService)
  // --------------------------------------------------
  onRemoteStroke: null,
  onRemoteClear:  null,
  onRemoteSync:   null
};

