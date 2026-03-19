// =======================================================
// WS/FILS/INDEX.JS – Domaine Fils (Threads + Réponses)
// =======================================================

import { safeSend } from "../utils.js";
import wsContext from "../context.js";

// Stockage en mémoire (simple, extensible)
const threads = new Map(); 
// Structure : threadId -> { id, roomId, authorId, authorName, text, createdAt, replies: [] }

let nextThreadId = 1;
let nextReplyId = 1;

// =======================================================
// INITIALISATION DU DOMAINE
// =======================================================
export function initFils(wsContext) {
  console.log("🧵 Domaine FILS initialisé");
}

// =======================================================
// ROUTEUR DU DOMAINE FILS
// =======================================================
export function handleFilsMessages(ws, data) {
  switch (data.type) {
    case "createThread":
      return createThread(ws, data);
    case "replyThread":
      return replyThread(ws, data);
  }
}

// =======================================================
// CRÉER UN THREAD
// =======================================================
function createThread(ws, { roomId, text }) {
  if (!roomId || !text) {
    return safeSend(ws, {
      type: "error",
      message: "roomId et text requis pour createThread"
    });
  }

  const cleanText = text.trim().substring(0, 2000);
  if (!cleanText) {
    return safeSend(ws, {
      type: "error",
      message: "Texte invalide"
    });
  }

  const thread = {
    id: nextThreadId++,
    roomId,
    authorId: ws.userId,
    authorName: ws.userName,
    text: cleanText,
    createdAt: new Date().toISOString(),
    replies: []
  };

  threads.set(thread.id, thread);

  broadcastRoom(roomId, {
    type: "threadCreated",
    thread
  });

  console.log(`🧵 Nouveau thread #${thread.id} créé dans ${roomId} par ${ws.userName}`);
}

// =======================================================
// RÉPONDRE À UN THREAD
// =======================================================
function replyThread(ws, { roomId, threadId, text }) {
  if (!roomId || !threadId || !text) {
    return safeSend(ws, {
      type: "error",
      message: "roomId, threadId et text requis pour replyThread"
    });
  }

  const thread = threads.get(threadId);
  if (!thread) {
    return safeSend(ws, {
      type: "error",
      message: "Thread introuvable"
    });
  }

  const cleanText = text.trim().substring(0, 2000);
  if (!cleanText) {
    return safeSend(ws, {
      type: "error",
      message: "Texte invalide"
    });
  }

  const reply = {
    id: nextReplyId++,
    threadId,
    authorId: ws.userId,
    authorName: ws.userName,
    text: cleanText,
    createdAt: new Date().toISOString()
  };

  thread.replies.push(reply);

  broadcastRoom(roomId, {
    type: "threadReplied",
    reply
  });

  console.log(`💬 Réponse #${reply.id} ajoutée au thread #${threadId} dans ${roomId}`);
}

// =======================================================
// BROADCAST ROOM (réutilise rooms.js)
// =======================================================
function broadcastRoom(roomId, payload) {
  const room = wsContext.rooms.get(roomId);
  if (!room) return;

  for (const client of room) {
    if (client.readyState === 1) {
      safeSend(client, payload);
    }
  }
}

// =======================================================
// EXPORTS
// =======================================================
export function getThreads(roomId) {
  return [...threads.values()].filter(t => t.roomId === roomId);
}

export function getThreadById(id) {
  return threads.get(id);
}
