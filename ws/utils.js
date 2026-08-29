// =======================================================
// WS.UTILS.JS – Utilitaires WebSocket (CORRIGÉ & SÉCURISÉ)
// =======================================================

import { getOnlineProfessors } from './state/onlineProfessors.js';
import jwt from 'jsonwebtoken';
import redis from "../config/redis.js";

const BROADCAST_KEY = "broadcast:onlineProfs";
const BROADCAST_DELAY = 500; // ms

// =======================================================
// SAFE SEND
// =======================================================
export function safeSend(ws, data) {
  if (!ws || ws.readyState !== 1) {
    return false;
  }

  try {
    // Éviter les objets circulaires s'il y a un champ ws
    const cleanData = typeof data === 'object' && data !== null ? { ...data } : data;
    if (cleanData.ws) delete cleanData.ws;

    ws.send(JSON.stringify(cleanData));
    console.log("📤 safeSend SUCCESS:", cleanData.type, "to user:", ws.userId, cleanData.type === "error" ? `— message: "${cleanData.message}"` : "");
    return true;
  } catch (err) {
    console.error("❌ safeSend ERROR:", err.message);
    return false;
  }
}

// =======================================================
// BROADCAST AUX ÉLÈVES (AVEC REDIS OU FALLBACK)
// =======================================================
// ✅ On accepte (onlineProfessors, clients) OU (clients) de manière flexible
export async function broadcastOnlineProfs(arg1, arg2) {
  // Rétro-compatibilité : Si 2 arguments sont passés (onlineProfessors, clients)
  const clients = arg2 || arg1;

  const sendToEleves = () => {
    const profs = getOnlineProfessors();
    console.log(`📡 Broadcast: ${profs.length} profs envoyés aux élèves.`);
    const payload = {
      type: "onlineProfessors",
      profs,
      timestamp: new Date().toISOString()
    };
    for (const ws of clients.values()) {
      if (ws.role === "eleve" && ws.readyState === 1) {
        safeSend(ws, payload);
      }
    }
  };

  try {
    const acquired = await redis.set(BROADCAST_KEY, "1", "PX", BROADCAST_DELAY, "NX");
    if (!acquired) return;

    setTimeout(() => {
      try {
        sendToEleves();
        } catch (err) {
        console.error("❌ Broadcast erreur:", err.message);
      }
    }, BROADCAST_DELAY);

  } catch (err) {
    console.warn("⚠️ Redis indisponible, broadcast direct:", err.message);
    sendToEleves();
  }
}
// =======================================================
// BROADCAST À UN RÔLE SPÉCIFIQUE
// =======================================================
export function broadcastToRole(clients, role, payload) {
  let count = 0;
  for (const ws of clients.values()) {
    if (ws.role === role && ws.readyState === 1) {
      if (safeSend(ws, payload)) count++;
    }
  }
  console.log(`📡 Message envoyé à ${count} ${role}s`);
  return count;
}

// =======================================================
// ENVOYER À UN USER SPÉCIFIQUE
// =======================================================
export function sendToUser(clients, userId, payload) {
  const ws = clients.get(userId);
  if (!ws) {
    console.warn(`⚠️ User ${userId} non connecté`);
    return false;
  }
  return safeSend(ws, payload);
}

// =======================================================
// ESCAPE HTML & VALIDATE
// =======================================================
export function escapeHtml(text) {
  if (!text) return "";
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

export function validateMessage(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: "Message invalide" };
  }
  if (!data.type || typeof data.type !== 'string') {
    return { valid: false, error: "Type manquant" };
  }
  return { valid: true };
}

export function parseToken(token, secret) {
  try {
    return jwt.verify(token, secret);
  } catch (err) {
    console.warn("⚠️ Token invalide:", err.message);
    return null;
  }
}

// =======================================================
// CLEANUP DISCONNECT (CORRIGÉ & PROTÉGÉ)
// =======================================================
// =======================================================
// CLEANUP DISCONNECT (BUG 2 CORRIGÉ)
// =======================================================
export function cleanupOnDisconnect(ws, deps) {
  const { clients, onlineProfessors, rooms } = deps;
  const { userId, role } = ws;

  if (!userId) return;

  // ✅ Ne supprimer de clients que si cette instance est bien la socket active
  const isActive = clients.get(userId) === ws;
  if (isActive) {
    clients.delete(userId);
  }
  console.log(`❌ WS fermé: ${userId} (Rôle: ${role})`);
  // 1. PROFESSEUR
  if (role === "prof") {
    
    // ✅ FIX : on ne supprime JAMAIS le prof de onlineProfessors ici.
    // setProfessorOffline() (appelé juste avant dans handleDisconnect) s'est déjà
    // chargé de couper la référence WS tout en gardant le prof visible/reconnectable.
    // La suppression définitive de onlineProfessors ne doit se produire que sur une
    // déconnexion manuelle explicite (voir le handler "logout" dans socket.js, qui
    // appelle removeProfessor()).
    broadcastOnlineProfs(onlineProfessors, clients);
  }
  // 2. ÉLÈVE
  // ✅ NETTOYAGE : la libération du prof (status='disponible', eleveId=null) et la
  // notification callEnded sont déjà gérées en amont par endSessionForDisconnect()
  // (appelé dans handleDisconnect avant cleanupOnDisconnect). Ce bloc ne trouvait
  // donc plus jamais de correspondance — supprimé pour éviter la confusion.
  else if (role === "eleve") {
    if (!ws._isReplacedConnection) {
      broadcastOnlineProfs(onlineProfessors, clients);
    }
  }
 // 3. ÉTUDIANT
  else if (role === "etudiant") {
    if (!ws._isReplacedConnection) {
      broadcastOnlineStudents(clients);
    }
  }

  // 4. ROOMS
 // ws/utils.js — cleanupOnDisconnect, section "4. ROOMS"
if (ws.roomId && rooms.has(ws.roomId)) {
    const room = rooms.get(ws.roomId);

    // ✅ NOUVEAU — si ws n'est déjà plus dans la room (donc déjà géré par
    // handleUnexpectedDisconnect pour une déconnexion pendant une session
    // active), on ne renvoie pas un second message contradictoire.
    if (room.has(ws)) {
      room.forEach(client => {
        if (client !== ws && client.readyState === 1) {
          safeSend(client, { type: "userLeftRoom", userId, role });
        }
      });
      room.delete(ws);
      if (room.size === 0) {
        rooms.delete(ws.roomId);
        console.log(`🏠 Room ${ws.roomId} supprimée (vide)`);
      }
    }
}

  console.log(`✅ Nettoyage complet effectué pour ${userId}`);
}
// =======================================================
// RATE LIMITER
// =======================================================
export class RateLimiter {
  constructor(maxRequests = 10, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  isAllowed(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];

    const recentRequests = userRequests.filter(time => now - time < this.windowMs);

    if (recentRequests.length >= this.maxRequests) {
      console.warn("⚠️ RateLimit", `Utilisateur ${userId} rate limited`);
      return false;
    }

    recentRequests.push(now);
    this.requests.set(userId, recentRequests);
    return true;
  }

  reset(userId) {
    this.requests.delete(userId);
  }

  resetAll() {
    this.requests.clear();
  }
}

// =======================================================
// BROADCAST ÉTUDIANTS (SÉCURISÉ AVEC SAFESEND)
// =======================================================
export function broadcastOnlineStudents(clientsMap) {
  const studentsList = [];

  for (const client of clientsMap.values()) {
    if (client.role === "etudiant" && client.readyState === 1 && client.identified) {
      studentsList.push({
        id: client.userId,
        prenom: client.prenom || "Étudiant",
        nom: client.nom || "",
        matiere: client.matiere || "Général",
        niveau: client.niveau || "",
        role: client.role
      });
    }
  }

  const payload = {
    type: "student:onlineStudents",
    students: studentsList
  };

  clientsMap.forEach(ws => {
    if (ws.readyState === 1 && ws.role === "etudiant") {
      safeSend(ws, payload); // ✅ Corrigé : utilise safeSend au lieu de ws.send
    }
  });

  console.log(`📡 P2P Broadcast: ${studentsList.length} étudiants envoyés aux pairs.`);
}

export function generateRoomId(profId, eleveId) {
  return `room_${profId}_${eleveId}`;
}

export function parseRoomId(roomId) {
  if (!roomId?.startsWith('room_')) return null;
  const parts = roomId.split('_');
  if (parts.length !== 3) return null;
  const profId = parseInt(parts[1], 10);
  const eleveId = parseInt(parts[2], 10);
  if (isNaN(profId) || isNaN(eleveId)) return null;
  return { profId, eleveId };
}