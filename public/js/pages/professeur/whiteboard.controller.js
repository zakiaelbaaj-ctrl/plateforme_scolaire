export class WhiteboardController {

  constructor({ canvas, service, socket }) {
    this.canvas = canvas;
    this.service = service;
    this.socket = socket;
  }

  // ==============================
  // LOCAL
  // ==============================
  startPath(data) { this.service.startPath(data); }
  addPoint(point) { this.service.addPoint(point); }
  endPath() {
    const path = this.service.endPath();
    this.socket.sendStroke(path);
  }
  undo() {
    const path = this.service.undo();
    if (path) this.socket.sendUndo(path);
  }
  redo() {
    const path = this.service.redo();
    if (path) this.socket.sendRedo(path);
  }
  clear() {
    this.service.clear();
    this.socket.sendClear();
  }

  // ==============================
  // REMOTE
  // ==============================
  handleRemotePath(path) {
    this.service.addRemotePath(path);
    this.canvas.redraw();
  }

  handleRemoteUndo(authorId) {
    this.service.undoRemote(authorId);
    this.canvas.redraw();
  }

  handleRemoteRedo(authorId) {
    this.service.redoRemote(authorId);
    this.canvas.redraw();
  }

  handleRemoteClear(authorId) {
    this.service.clearRemote(authorId);
    this.canvas.redraw();
  }

  handleRemoteSync(paths) {
    this.service.sync(paths);
    this.canvas.redraw();
  }
}
