// ======================================================
// FILE TRANSFER MANAGER (PRO VERSION)
// ======================================================

import { Logger } from "/js/lib/logger.js";

const CHUNK_SIZE = 16 * 1024;

export class FileTransferManager {

  constructor() {
    this.transfers = {}; // { fileId: { ... } }
  }

  // ====================================================
  // Ã°ÂÂÂ SEND FILE
  // ====================================================

  async sendFile(file, channel, onProgress) {

    if (!file || !channel) return;

    const fileId = crypto.randomUUID();

    Logger.log("Ã°ÂÂÂ¤ Envoi fichier :", file.name);

    // META
    channel.send(JSON.stringify({
      type: "file-meta",
      id: fileId,
      name: file.name,
      size: file.size,
    }));

    let offset = 0;
    const reader = new FileReader();

    reader.onload = async (e) => {

      const buffer = e.target.result;

      // BACKPRESSURE CONTROL
      while (channel.bufferedAmount > 1_000_000) {
        await new Promise(r => setTimeout(r, 10));
      }

      // SEND CHUNK AVEC ID
      channel.send(JSON.stringify({
        type: "file-chunk",
        id: fileId,
      }));

      channel.send(buffer);

      offset += buffer.byteLength;

      onProgress?.(Math.floor((offset / file.size) * 100));

      if (offset < file.size) {
        readSlice(offset);
      } else {
        channel.send(JSON.stringify({
          type: "file-end",
          id: fileId,
        }));

        Logger.log("Ã¢ÂÂ Fichier envoyÃÂ© :", file.name);
      }
    };

    reader.onerror = () => {
      Logger.error("Ã¢ÂÂ File read error:", reader.error);
    };

    const readSlice = (o) => {
      const slice = file.slice(o, o + CHUNK_SIZE);
      reader.readAsArrayBuffer(slice);
    };

    readSlice(0);
  }

  // ====================================================
  // Ã°ÂÂÂ¥ HANDLE MESSAGE
  // ====================================================

  handleMessage(msg, onComplete, onProgress) {

    switch (msg.type) {

      case "file-meta":
        this.transfers[msg.id] = {
          id: msg.id,
          name: msg.name,
          size: msg.size,
          received: 0,
          chunks: [],
          expectingChunk: false,
        };

        Logger.log("Ã°ÂÂÂ¦ RÃÂ©ception fichier :", msg.name);
        break;

      case "file-chunk":
        if (this.transfers[msg.id]) {
          this.transfers[msg.id].expectingChunk = true;
        }
        break;

      case "file-end":
        this._assemble(msg.id, onComplete);
        break;
    }
  }

  // ====================================================
  // Ã°ÂÂÂ¦ HANDLE BINARY
  // ====================================================

  handleChunk(buffer, onProgress) {

    const transfer = Object.values(this.transfers)
      .find(t => t.expectingChunk);

    if (!transfer) {
      Logger.warn("Ã¢ÂÂ Ã¯Â¸Â Chunk sans contexte");
      return;
    }

    transfer.expectingChunk = false;

    transfer.chunks.push(buffer);
    transfer.received += buffer.byteLength;

    onProgress?.(
      transfer.id,
      Math.floor((transfer.received / transfer.size) * 100)
    );
  }

  // ====================================================
  // Ã°ÂÂÂ¦ ASSEMBLE
  // ====================================================

  _assemble(id, onComplete) {

    const t = this.transfers[id];
    if (!t) return;

    const blob = new Blob(t.chunks);
    const url  = URL.createObjectURL(blob);

    Logger.log("Ã°ÂÂÂ¥ Fichier complet :", t.name);

    onComplete?.({
      id: t.id,
      name: t.name,
      blob,
      url,
    });

    delete this.transfers[id];
  }

  // ====================================================
  // RESET
  // ====================================================

  reset() {
    this.transfers = {};
  }
}
