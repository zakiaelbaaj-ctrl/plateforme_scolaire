// ======================================================
// DOCUMENT DOMAIN SERVICE — LOGIQUE METIER PURE
// ======================================================

import { socketService } from "/js/core/socket.service.js";
import { AppState }      from "/js/core/state.js";
import { showNotification } from "/js/ui/components/notification.js";
export const DocumentService = {

  // --------------------------------------------------
  // SYSTEME D'ABONNEMENT
  // --------------------------------------------------

  _listeners: [],

  onDocument(callback) {
    if (typeof callback === "function") {
      this._listeners.push(callback);
    }
  },

  _notify(doc) {
    this._listeners.forEach(cb => cb(doc));
  },

  // --------------------------------------------------
  // ENVOI DOCUMENT (Élève → serveur)
  // --------------------------------------------------

  send(file) {
    if (!file || !AppState.currentRoomId) return;

    const reader = new FileReader();

    reader.onload = () => {
      const userName = AppState.currentUser
        ? `${AppState.currentUser.prenom ?? ""} ${AppState.currentUser.nom ?? ""}`.trim()
        : "Utilisateur";
      socketService.send({
        type: "document",
        roomId: AppState.currentRoomId,
        userName,
        fileName: file.name,
        fileType: file.type || guessFileType(file.name),
        fileData: reader.result
      });
      // ✅ Notification côté envoyeur
  showNotification(`📎 "${file.name}" envoyé avec succès`);
    };

    reader.readAsDataURL(file);
  },

  // --------------------------------------------------
  // RECEPTION DOCUMENT
  // --------------------------------------------------

  async handleEvent(data) {
  const { userId, userName, fileName, fileType, fileData } = data;
  const finalUser = userName?.trim() || "Utilisateur inconnu";
  const finalType = fileType || guessFileType(fileName);

  // 🔹 Télécharger automatiquement le document
await this._downloadFile(fileName, fileData);
// 🔹 Notifier l'UI si besoin
  this._notify({
    userName: finalUser,
    fileName,
    fileType: finalType,
    fileData
  });
  // ✅ Notification côté receveur
showNotification(`📎 "${fileName}" reçu de ${finalUser}`);
},

  // --------------------------------------------------
  // PROF ➔ ENVOI DOCUMENT CIBLE
  // --------------------------------------------------

  sendDocumentToEleve(doc, eleveId) {
    if (!doc || !eleveId || !AppState.currentRoomId) return;

    socketService.send({
      type: "document",
      roomId: AppState.currentRoomId,
      targetUserId: eleveId,
      action: "download",
      fileName: doc.fileName,
      fileType: guessFileType(doc.fileName),
      fileData: doc.fileData
    });
  },

  // --------------------------------------------------
  // TELECHARGEMENT LOCAL
  // --------------------------------------------------

  // APRÈS — à coller ici
async _downloadFile(fileName, fileData) {
  let href = fileData;
  if (fileData.startsWith("http")) {
    const res = await fetch(fileData);
    const blob = await res.blob();
    href = URL.createObjectURL(blob);
  }
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  if (href !== fileData) URL.revokeObjectURL(href);
}

}; // ⬅️ fermeture propre du service

// --------------------------------------------------
// FONCTION UTILITAIRE (hors service)
// --------------------------------------------------

function guessFileType(name) {
  if (!name) return "application/octet-stream";

  const ext = name.split(".").pop().toLowerCase();

  if (["png","jpg","jpeg","gif"].includes(ext))
    return "image/" + ext.replace("jpg","jpeg");

  if (ext === "pdf")
    return "application/pdf";

  if (["doc","docx"].includes(ext))
    return "application/msword";

  if (["xls","xlsx"].includes(ext))
    return "application/vnd.ms-excel";

  if (["ppt","pptx"].includes(ext))
    return "application/vnd.ms-powerpoint";

  return "application/octet-stream";
}

