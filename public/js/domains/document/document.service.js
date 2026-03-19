// ======================================================
// DOCUMENT DOMAIN SERVICE — LOGIQUE MÉTIER PURE
// ======================================================

import { SocketService } from "/js/core/socket.service.js";
import { AppState }      from "/js/core/state.js";

export const DocumentService = {

  // --------------------------------------------------
  // SYSTÈME D'ABONNEMENT
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
  // ENVOI DOCUMENT (élève → serveur)
  // --------------------------------------------------

  send(file) {
    if (!file || !AppState.currentRoomId) return;

    const reader = new FileReader();

    reader.onload = () => {
      const userName = AppState.currentUser
        ? `${AppState.currentUser.prenom ?? ""} ${AppState.currentUser.nom ?? ""}`.trim()
        : "Utilisateur";

      console.log("🟢 Envoi document:", file.name, AppState.currentRoomId, "sender:", userName);

      SocketService.send({
        type: "document",
        roomId: AppState.currentRoomId,
        userName,
        fileName: file.name,
        fileType: file.type || guessFileType(file.name),
        fileData: reader.result
      });
    };

    reader.readAsDataURL(file);
  },

  // --------------------------------------------------
  // RÉCEPTION DOCUMENT
  // --------------------------------------------------

  async handleEvent(data) {
    console.log("🔍 handleEvent appelé, currentUser role:", AppState.currentUser?.role);
  const { userId, userName, fileName, fileType, fileData } = data;
   console.log("📄 fileData reçu:", fileData?.substring(0, 100));
  const finalUser = userName?.trim() || "Utilisateur inconnu";
  const finalType = fileType || guessFileType(fileName);

  console.log("📥 Document reçu:", {
    fileName,
    from: userId,
    userName: finalUser
  });

  // 🔹 Télécharger automatiquement le document
  await this._downloadFile(fileName, fileData);
  // 🔹 Notifier l'UI si besoin
  this._notify({
    userName: finalUser,
    fileName,
    fileType: finalType,
    fileData
  });
},

  // --------------------------------------------------
  // PROF → ENVOI DOCUMENT CIBLÉ
  // --------------------------------------------------

  sendDocumentToEleve(doc, eleveId) {
    if (!doc || !eleveId || !AppState.currentRoomId) return;

    SocketService.send({
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
  // TÉLÉCHARGEMENT LOCAL
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

}; // ← fermeture propre du service


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