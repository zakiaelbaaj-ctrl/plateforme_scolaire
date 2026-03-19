// =======================================================
// ws/files/permissions.js
// Gestion des permissions d'upload de fichiers
// =======================================================

/**
 * Vérifie si un utilisateur a le droit d'uploader un fichier
 * @param {WebSocket} ws
 * @returns {boolean}
 */
export function canUpload(ws) {
  if (!ws || !ws.userId || !ws.role) {
    return false;
  }

  // 🔐 Règles simples (extensibles plus tard)
  // - Professeur : autorisé
  // - Élève : autorisé uniquement si dans une room active
  // - Autres rôles : refusé

  if (ws.role === "prof") {
    return true;
  }

  if (ws.role === "eleve") {
    // L'élève doit être dans une room active
    return !!ws.roomId;
  }

  // Rôle inconnu → refus
  return false;
}
