import { socketService } from "/js/core/socket.service.js";
import { WhiteboardPayloadFactory } from "./whiteboard.contract.js";
import { WhiteboardSocketEvents as SocketEvents } from "./whiteboard.contract.js";

export class WhiteboardSocket {

  constructor({ controller, roomId, myUserId }) {
    this.controller = controller;
    this.roomId = roomId;
    this.myUserId = myUserId;
    this._listener = null;

    this._registerSocketListeners();
  }

  sendStroke(path) {
    socketService.send(WhiteboardPayloadFactory.createStroke(path, this.roomId));
  }

  sendUndo(path) {
    socketService.send(WhiteboardPayloadFactory.createUndo(path, this.roomId));
  }

  sendRedo(path) {
    socketService.send(WhiteboardPayloadFactory.createRedo(path, this.roomId));
  }

  sendClear() {
    socketService.send(WhiteboardPayloadFactory.createClear(this.roomId));
  }

  sendSyncRequest() {
    socketService.send(WhiteboardPayloadFactory.createSyncRequest(this.roomId));
  }

  _registerSocketListeners() {
    this._listener = (data) => {
      if (!data || String(data.roomId) !== String(this.roomId)) return;

      switch (data.type) {
        case SocketEvents.TABLEAU_STROKE:
          if (data.path.authorId !== this.myUserId)
            this.controller.handleRemotePath(data.path);
          break;

        case SocketEvents.TABLEAU_UNDO:
          if (data.authorId !== this.myUserId)
            this.controller.handleRemoteUndo(data.authorId);
          break;

        case SocketEvents.TABLEAU_REDO:
          if (data.authorId !== this.myUserId)
            this.controller.handleRemoteRedo(data.authorId);
          break;

        case SocketEvents.TABLEAU_CLEAR:
          if (data.authorId !== this.myUserId)
            this.controller.handleRemoteClear(data.authorId);
          break;

        case SocketEvents.TABLEAU_SYNC:
          this.controller.handleRemoteSync(data.paths);
          break;

        default:
          break;
      }
    };
    socketService.onMessage(this._listener);
  }

  destroy() {
    if (this._listener) {
      socketService.offMessage(this._listener);
      this._listener = null;
    }
  }
}

