// ======================================================
// DATACHANNEL SERVICE (PROPRE)
// Chat + Draw + Whiteboard + extensible
// ======================================================
import { WhiteboardService } from "/js/domains/whiteboard/whiteboard.service.js";
import { Logger } from "/js/lib/logger.js";
import { FileTransferManager } from "/js/webrtc/file.transfer.js";

const fileTransfer = new FileTransferManager();
export const DataChannelService = (() => {

  let channels = {
    chat: null,
    draw: null,
  };
  let currentSendHandlers = {};

  // ====================================================
  // INIT
  // ====================================================

  function init(peerConnection, isInitiator, handlers = {}) {
   currentSendHandlers = handlers;   // 🆕 sans cette ligne, currentSendHandlers reste toujours {}
    if (isInitiator) {
  channels.chat = peerConnection.createDataChannel("chat", { ordered: true });
  channels.draw = peerConnection.createDataChannel("draw", {
    ordered: false,
    maxRetransmits: 0,
  });

  setup(channels.chat, handlers);
  setup(channels.draw, handlers);
}

peerConnection.ondatachannel = (event) => {
  const channel = event.channel;
  channels[channel.label] = channel;

  // ✅ onDrawReady côté non-initiateur (ton cas dans les logs)
  if (channel.label === "draw") {
    channel.onopen = () => {
      Logger.log("✅ DC open: draw");
      handlers.onDrawReady?.();
    };
  }

  setup(channel, handlers);
};
  }

  // ====================================================
  // SETUP CHANNEL
  // ====================================================

  function setup(channel, handlers) {

    channel.onopen = () => {
      Logger.log("✅ DC open:", channel.label);
    if (channel.label === "draw") {
      handlers.onDrawReady?.();
    }
    };

    channel.onclose = () => {
      Logger.log("❌ DC closed:", channel.label);
    };

    // ❌ Avant — log toutes les erreurs
channel.onerror = (err) => {
  Logger.error("❌ DC error:", channel.label, err);
};

// ✅ Après — ignorer les erreurs de fermeture volontaire
channel.onerror = (err) => {
  const reason = err?.error?.message ?? "";
  if (
    reason.includes("User-Initiated Abort") ||
    reason.includes("Close called") ||
    reason.includes("Transport closed")
  ) {
    Logger.log(`ℹ️ DC ${channel.label} fermé proprement`);
    return;
  }
  Logger.error("❌ DC error:", channel.label, err);
};

    channel.onmessage = (event) => {

  const data = event.data;

  // 📦 BINAIRE → fichier
  if (data instanceof ArrayBuffer) {
    fileTransfer.handleChunk(data, (id, progress) => {
      handlers.onFileProgress?.(id, progress);
    });
    return;
  }

  let msg;
  try { msg = JSON.parse(data); }
  catch {
    Logger.warn("⚠️ message non JSON");
    return;
  }

  // 📁 FILE TRANSFER
  if (msg.type?.startsWith("file")) {
    fileTransfer.handleMessage(
      msg,
      (file) => handlers.onFileComplete?.(file),
      (id, progress) => handlers.onFileProgress?.(id, progress)
    );
    return;
  }

  //¡ NORMAL ROUTING
  handleMessage(channel.label, msg, handlers);
};
  }

  // ====================================================
  // HANDLE MESSAGE
  // ====================================================

 function handleMessage(label, msg, handlers) {

    if (label === "chat") {

      if (msg.type === "chat") {
        handlers.onChat?.(msg.text);
      }

      return;
    }

    if (label === "draw") {

      switch (msg.type) {
case "stroke":
  WhiteboardService.handleEvent({ type: "tableauStroke", path: msg.payload });
  break;
case "text":
  WhiteboardService.handleEvent({ type: "tableauText", textStroke: msg.payload });
  break;
case "clear":
  WhiteboardService.handleEvent({ type: "tableauClear", authorId: msg.payload?.authorId });
  break;
case "undo":
  WhiteboardService.handleEvent({ type: "tableauUndo", authorId: msg.payload?.authorId });
  break;
case "redo":
  WhiteboardService.handleEvent({ type: "tableauRedo", authorId: msg.payload?.authorId });
  break;
        default:
          Logger.warn("⚠️ draw message inconnu :", msg.type);
      }
    }
  }
  function isDrawReady() {
  return channels.draw?.readyState === "open";
}
  // ====================================================
  // SEND CHAT
  // ====================================================

  function sendChat(text) {
    const ch = channels.chat;

    if (!text || ch?.readyState !== "open") return;

    ch.send(JSON.stringify({
      type: "chat",
      text,
    }));
  }

  // ====================================================
  // DRAW EVENTS
  // ====================================================

  function sendStroke(stroke) {
    sendDraw({ type: "stroke", payload: stroke });
  }

  function sendText(textObj) {
    sendDraw({ type: "text", payload: textObj });
  }

  function clear() {
    sendDraw({ type: "clear" });
  }

  function sendDraw(payload) {
    const ch = channels.draw;

    if (ch?.readyState !== "open") return;

    ch.send(JSON.stringify(payload));
  }

  // ====================================================
  // FILE (EXTENSION READY)
  // ====================================================

  function sendFileChunk(buffer) {
    const ch = channels.draw;

    if (ch?.readyState !== "open") return;

    ch.send(buffer);
  }

  function sendFileMeta(meta) {
    sendDraw({ type: "file-meta", ...meta });
  }

  function sendFileEnd(id) {
    sendDraw({ type: "file-end", id });
  }
   function sendFile(file) {
  const ch = channels.draw; // ← variable locale, pas window.channels

if (!ch) {
  Logger.warn("⚠️ channel draw inexistant ou non initialisé");
  return;
}

if (ch.readyState !== "open") {
  Logger.warn("⚠️ channel non prêt, état :", ch.readyState);
  return;
}

let lastProgress = -1;

fileTransfer.sendFile(file, ch, (progress) => { // ← fileTransfer local, pas window.fileTransfer
  const rounded = Math.floor(progress);

  if (rounded !== lastProgress) {
    lastProgress = rounded;
    console.log("📤 progress :", rounded);

     // 🆕 Détection de la fin d'envoi
      if (rounded >= 100) {
        Logger.log("✅ Fichier envoyé avec succès :", file.name);
        currentSendHandlers?.onFileSent?.({ name: file.name, size: file.size });
      }
    }
  });
}
  // ====================================================
  // CLEANUP
  // ====================================================

 function reset() {
  Object.values(channels).forEach(ch => {
    if (!ch) return;
    if (ch.readyState === "open" || ch.readyState === "connecting") {
      try { ch.close(); } catch {}
    }
  });
  channels = { chat: null, draw: null };
}

  // ====================================================
  // API
  // ====================================================

  return {
    init,

    sendChat,
    sendStroke,
    sendText,
    sendDraw,
    isDrawReady,
    clear,
    sendFile,
    sendFileChunk,
    sendFileMeta,
    sendFileEnd,

    reset,
  };

})();
