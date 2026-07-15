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

  // 🟢 MODE NÉGOCIÉ + ID FIXE
  // Les deux pairs créent EUX-MÊMES leurs canaux, avec le même id.
  // Comme ils ne dépendent plus de l'échange SDP (négociation "in-band"
  // classique), ils survivent à toute renégociation ultérieure
  // (partage d'écran, ICE restart, etc.) — plus de fermeture intempestive.
  channels.chat = peerConnection.createDataChannel("chat", {
    ordered: true,
    negotiated: true,
    id: 1,
  });
  channels.draw = peerConnection.createDataChannel("draw", {
    ordered: false,
    maxRetransmits: 10,
    negotiated: true,
    id: 2,
  });

  setup(channels.chat, handlers);
  setup(channels.draw, handlers);

  // Plus besoin de ondatachannel pour chat/draw : les deux côtés les créent
  // localement avec le même id. On garde le handler pour d'éventuels
  // futurs canaux créés dynamiquement par l'autre pair.
  peerConnection.ondatachannel = (event) => {
    const channel = event.channel;
    if (channels[channel.label]) return; // déjà géré ci-dessus, on ignore le doublon
    channels[channel.label] = channel;
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
    if (channel.label === "chat") {           // 🟢 AJOUT
      handlers.onChatReady?.();
    }
    };

   channel.onclose = () => {
  Logger.log("❌ DC closed:", channel.label);

  if (channel.label === "draw") {
    handlers.onDrawClosed?.();
  }
  if (channel.label === "chat") {
    handlers.onChatClosed?.();
  }
};

// Gestion propre des erreurs
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
   currentSendHandlers?.onFileError?.({ name: file.name, reason: "no-channel" }); // 🟢 AJOUT
    return;
}

if (ch.readyState !== "open") {
  Logger.warn("⚠️ channel non prêt, état :", ch.readyState);
  currentSendHandlers?.onFileError?.({ name: file.name, reason: ch.readyState }); // 🟢 AJOUT manquant
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
