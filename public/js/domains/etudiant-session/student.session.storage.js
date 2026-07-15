// /js/domains/etudiant-session/student.session.storage.js

const KEY_ROOM = "student:activeRoomId";
const KEY_PARTNER = "student:activePartner"; // 🟢 AJOUT

export const StudentSessionStorage = {
  save(roomId) {
    if (!roomId) return;
    sessionStorage.setItem(KEY_ROOM, roomId);
  },

  get() {
    return sessionStorage.getItem(KEY_ROOM);
  },

  clear() {
    sessionStorage.removeItem(KEY_ROOM);
    sessionStorage.removeItem(KEY_PARTNER); // 🟢 AJOUT : nettoie aussi le partenaire
  },

  // 🟢 AJOUT — persistance des infos du partenaire (nécessaire pour restaurer
  // l'UI après un rechargement de page, où student:matchFound ne sera jamais renvoyé)
  savePartner({ partnerName, partnerVille, partnerPays }) {
    sessionStorage.setItem(KEY_PARTNER, JSON.stringify({
      partnerName: partnerName || "",
      partnerVille: partnerVille || "",
      partnerPays: partnerPays || "",
    }));
  },

  getPartner() {
    const raw = sessionStorage.getItem(KEY_PARTNER);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
};