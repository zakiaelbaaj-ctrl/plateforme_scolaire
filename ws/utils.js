// =======================================================
// WS.UTILS.JS – Utilitaires WebSocket (OPTIMISÉ)
// Fonctions partagées et sécurité
// =======================================================

import { getOnlineProfessors } from './state/onlineProfessors.js';
import jwt from 'jsonwebtoken';  // ✅ Import au top plutôt que dans la fonction

// =======================================================
// SAFE SEND
// =======================================================
export function safeSend(ws, data) {
  if (!ws || ws.readyState !== 1) {
    console.error("❌ safeSend FAILED - ws invalid or closed:", {
      wsExists: !!ws,
      readyState: ws?.readyState
    });
    return false; // ✅ important
  }

  try {
    ws.send(JSON.stringify(data));
    console.log("📤 safeSend SUCCESS:", data.type, "to user:", ws.userId);
    return true; // ✅ important
  } catch (err) {
    console.error("❌ safeSend ERROR:", err.message);
    return false;
  }
}
// =======================================================
// BROADCAST AUX ÉLÈVES
// =======================================================
export function broadcastOnlineProfs(onlineProfessors, clients) {
  const allProfs = onlineProfessors || new Map();

  // 1. Préparation et Tri (Disponibles en premier)
  const profs = Array.from(allProfs.values())
    .sort((a, b) => {
      const statusOrder = { disponible: 0, en_appel: 1, occupe: 2, absent: 3 };
      return (statusOrder[a.status] || 99) - (statusOrder[b.status] || 99);
    })
    .map(prof => ({
      id: prof.id,
      prenom: prof.prenom || "",
      nom: prof.nom || "",
      ville: prof.ville || "",
      pays: prof.pays || "",
      status: prof.status,
      matiere: prof.matiere || "Général", // Ajouté pour l'élève
      eleveId: prof.eleveId || null
    }));

  console.log(`📡 Broadcast: ${profs.length} profs envoyés aux élèves.`);

  // 2. Diffusion ciblée uniquement aux élèves
  for (const ws of clients.values()) {
    if (ws.role === "eleve" && ws.readyState === 1) {
      safeSend(ws, {
        type: "onlineProfessors",
        profs,
        timestamp: new Date().toISOString()
      });
    }
  }
}
// =======================================================
// BROADCAST À UN RÔLE SPÉCIFIQUE
// =======================================================
export function broadcastToRole(clients, role, payload) {
  let count = 0;

  for (const ws of clients.values()) {
    if (ws.role === role && ws.readyState === 1) {
      if (safeSend(ws, payload)) {
        count++;
      }
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
// ESCAPE HTML (XSS prevention)
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

// =======================================================
// VALIDATE MESSAGE
// =======================================================
export function validateMessage(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: "Message invalide" };
  }

  if (!data.type || typeof data.type !== 'string') {
    return { valid: false, error: "Type manquant" };
  }

  return { valid: true };
}

// =======================================================
// PARSE JWT (OPTIMISÉ)
// =======================================================
export function parseToken(token, secret) {
  try {
    // ✅ jwt importé en haut
    return jwt.verify(token, secret);
  } catch (err) {
    console.warn("⚠️ Token invalide:", err.message);
    return null;
  }
}

// =======================================================
// CLEANUP DISCONNECT (OPTIMISÉ)
// =======================================================
export function cleanupOnDisconnect(ws, deps) {
  const { clients, onlineProfessors, rooms } = deps;

  const { userId, role } = ws;

  console.log(`❌ WS fermé: ${userId} (${role})`);

  // Supprimer du clients
  clients.delete(userId);

  // PROF se déconnecte
  if (role === "prof") {
    const prof = onlineProfessors.get(userId);

    // Si en session avec élève
    if (prof?.eleveId) {
      const studentWs = clients.get(prof.eleveId);
      if (studentWs?.readyState === 1) {
        safeSend(studentWs, {
          type: "callEnded",
          reason: "prof_disconnected",
          timestamp: new Date().toISOString()
        });
      }
    }

    // ✅ Vérifier que la méthode existe
    if (typeof onlineProfessors.endSession === 'function') {
      onlineProfessors.endSession(userId);
    }
    onlineProfessors.delete(userId);
  }

  // ÉLÈVE se déconnecte
  if (role === "eleve") {
    // Chercher si élève en session avec prof
    // ✅ Utiliser le paramètre plutôt qu'importer
    for (const prof of onlineProfessors.values()) {
      if (prof.eleveId === userId) {
        if (prof.ws?.readyState === 1) {
          safeSend(prof.ws, {
            type: "callEnded",
            reason: "eleve_disconnected",
            timestamp: new Date().toISOString()
          });
        }
        // ✅ Vérifier que la méthode existe
        if (typeof onlineProfessors.endSession === 'function') {
          onlineProfessors.endSession(prof.id);
        }
      }
    }
  }

  // Quitter room
  if (ws.roomId && rooms.has(ws.roomId)) {
    const room = rooms.get(ws.roomId);
    room.delete(ws);

    if (room.size === 0) {
      rooms.delete(ws.roomId);
    }
  }

  console.log(`✅ Nettoyage complet pour ${userId}`);
}

// =======================================================
// LOGGER UTILS
// =======================================================
export function logError(context, err) {
  console.error(`❌ [${context}]`, err.message || err);
}

export function logInfo(context, msg) {
  console.log(`ℹ️  [${context}]`, msg);
}

export function logSuccess(context, msg) {
  console.log(`✅ [${context}]`, msg);
}

export function logWarning(context, msg) {
  console.warn(`⚠️  [${context}]`, msg);
}

// =======================================================
// RATE LIMITING (SIMPLE MAIS EFFICACE)
// =======================================================
export class RateLimiter {
  constructor(maxRequests = 10, windowMs = 1000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  /**
   * Vérifier si une requête est autorisée
   * @param {number} userId - ID de l'utilisateur
   * @returns {boolean} true si autorisé, false si rate limited
   */
  isAllowed(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];

    // Nettoyer les old requests (hors de la fenêtre)
    const recentRequests = userRequests.filter(
      time => now - time < this.windowMs
    );

    if (recentRequests.length >= this.maxRequests) {
      logWarning("RateLimit", `Utilisateur ${userId} rate limited`);
      return false;
    }

    recentRequests.push(now);
    this.requests.set(userId, recentRequests);

    return true;
  }

  /**
   * Réinitialiser le rate limit pour un utilisateur
   * @param {number} userId - ID de l'utilisateur
   */
  reset(userId) {
    this.requests.delete(userId);
  }

  /**
   * Vider tous les rate limits
   */
  resetAll() {
    this.requests.clear();
  }

  /**
   * Obtenir le statut du rate limit pour un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {Object} {requests: count, allowed: boolean, resetIn: ms}
   */
  getStatus(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];

    const recentRequests = userRequests.filter(
      time => now - time < this.windowMs
    );

    const oldestRequest = recentRequests[0];
    const resetIn = oldestRequest ? Math.max(0, this.windowMs - (now - oldestRequest)) : 0;

    return {
      requests: recentRequests.length,
      allowed: recentRequests.length < this.maxRequests,
      resetIn
    };
  }
}

// =======================================================
// GENERATE ROOM ID
// =======================================================
export function generateRoomId(profId, eleveId) {
  return `room_${profId}_${eleveId}`;
}

// =======================================================
// PARSE ROOM ID
// =======================================================
export function parseRoomId(roomId) {
  if (!roomId?.startsWith('room_')) return null;

  const parts = roomId.split('_');
  if (parts.length !== 3) return null;

  const profId = parseInt(parts[1], 10);
  const eleveId = parseInt(parts[2], 10);

  if (isNaN(profId) || isNaN(eleveId)) return null;

  return { profId, eleveId };
}

// =======================================================
// FORMAT DURATION
// =======================================================
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0s";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

// =======================================================
// VALIDATE USER ID
// =======================================================
export function validateUserId(id) {
  const userId = parseInt(id, 10);
  return isNaN(userId) || userId <= 0 ? null : userId;
}

// =======================================================
// VALIDATE WEBSOCKET
// =======================================================
export function validateWebSocket(ws) {
  return ws && 
         ws.readyState === 1 &&
         ws.userId &&
         ws.role;
}
// =======================================================
// GESTION DES ÉTUDIANTS EN LIGNE
// =======================================================

export function getRealOnlineStudents(clientsMap) {
  const students = [];
  for (const client of clientsMap.values()) {
    // On prend les élèves/étudiants qui ne sont pas dans une room (roomId === null)
    if ((client.role === "etudiant" || client.role === "eleve") && !client.roomId) {
      students.push({
        id: client.userId,
        prenom: client.prenom,
        nom: client.nom,
        matiere: client.matiere,
        niveau: client.niveau
      });
    }
  }
  return students;
}
// ✅ POUR LES ÉTUDIANTS (Voient uniquement les étudiants)
export function broadcastOnlineStudents(clients) {
  const studentsData = Array.from(clients.values())
    .filter(ws => ws.role === "etudiant")
    .map(ws => ({ id: ws.userId, prenom: ws.prenom, nom: ws.nom, matiere: ws.matiere }));

  const payload = JSON.stringify({ type: "onlineStudents", students: studentsData });

  clients.forEach(ws => {
    if (ws.readyState === 1 && ws.role === "etudiant") {
      ws.send(payload);
    }
  });
}